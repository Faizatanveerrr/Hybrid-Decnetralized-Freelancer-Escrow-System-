import mongoose from 'mongoose';
import IpfsObject from '../models/IpfsObject.js';
import Project from '../models/Project.js';
import User from '../models/User.js';
import { requireUser, projectRole } from '../middleware/authHelper.js';
import { getIpfsConfig, isIpfsEnabled, getMaxBytes, isValidCid, storeEncrypted, storeJson, readDecrypted, buildSpec } from '../services/ipfsService.js';

const fail = (res, code, message) => res.status(code).json({ success: false, message });
const safeName = (s) => String(s || 'file').replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'file';

export const getConfig = (req, res) => res.json({ success: true, config: getIpfsConfig() });

/**
 * Upload a file (raw request body) to IPFS, encrypted.
 *   POST /api/ipfs/upload?projectId=..&kind=deliverable|evidence&name=..&type=..
 */
export const uploadFile = async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!isIpfsEnabled()) return fail(res, 503, 'File storage is not enabled on this server.');

    const { projectId, kind } = req.query;
    if (!mongoose.isValidObjectId(projectId)) return fail(res, 400, 'A valid projectId is required.');
    if (!['deliverable', 'evidence'].includes(kind)) return fail(res, 400, "kind must be 'deliverable' or 'evidence'.");

    const project = await Project.findById(projectId);
    const role = projectRole(project, user);
    if (!role) return fail(res, 403, 'Only project participants can upload files.');
    if (kind === 'deliverable' && role !== 'freelancer') return fail(res, 403, 'Only the freelancer can upload deliverables.');

    const buffer = req.body;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) return fail(res, 400, 'Send the file as the request body (empty upload).');
    if (buffer.length > getMaxBytes()) return fail(res, 413, `File too large (max ${getIpfsConfig().maxMb} MB).`);

    const stored = await storeEncrypted({
      buffer, projectId: project._id, uploadedBy: user._id, kind,
      name: safeName(req.query.name), mime: String(req.query.type || 'application/octet-stream').slice(0, 100)
    });
    res.status(201).json({ success: true, file: stored });
  } catch (error) {
    res.status(502).json({ success: false, message: `Storage error: ${error.message}` });
  }
};

/** Download + decrypt a stored file. Only participants of the file's project may read it. */
export const downloadFile = async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!isValidCid(req.params.cid)) return fail(res, 400, 'Invalid file id.');

    const object = await IpfsObject.findOne({ cid: req.params.cid });
    if (!object) return fail(res, 404, 'File not found.');
    const project = await Project.findById(object.projectId);
    if (!projectRole(project, user)) return fail(res, 403, 'Only project participants can read this file.');

    let bytes;
    try {
      bytes = await readDecrypted(object.cid);
    } catch (err) {
      return fail(res, 502, `Could not read or verify the file: ${err.message}`);
    }
    res.set({
      'Content-Type': object.mime || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${safeName(object.name)}"`,
      'X-Content-Type-Options': 'nosniff'
    });
    res.send(bytes);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Store the agreed job terms on IPFS and return the URI for the escrow contract.
 * Used when the client deploys the escrow from their own wallet (MetaMask).
 */
export const prepareSpec = async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (!isIpfsEnabled()) return fail(res, 503, 'File storage is not enabled on this server.');
    if (!mongoose.isValidObjectId(req.body.projectId)) return fail(res, 400, 'A valid projectId is required.');

    const project = await Project.findById(req.body.projectId).populate('milestones');
    if (!project) return fail(res, 404, 'Project not found.');
    if (projectRole(project, user) !== 'client') return fail(res, 403, 'Only the project client can do this.');
    const freelancer = project.freelancer ? await User.findById(project.freelancer) : null;

    const spec = buildSpec(project, { clientWallet: user.walletAddress, freelancerWallet: freelancer?.walletAddress || '' });
    const stored = await storeJson(spec, { projectId: project._id, uploadedBy: user._id, kind: 'spec', name: 'job-spec.json' });
    res.status(201).json({ success: true, uri: stored.uri, cid: stored.cid });
  } catch (error) {
    res.status(502).json({ success: false, message: `Storage error: ${error.message}` });
  }
};
