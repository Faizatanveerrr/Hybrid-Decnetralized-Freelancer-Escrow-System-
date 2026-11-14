/**
 * Files on IPFS. Everything is encrypted on the server before it is stored, so the
 * hash that goes on the blockchain proves a file was not changed, without making
 * it public. Only the project's client and freelancer can download (decrypt) it.
 */
import { getIpfsConfigApi, uploadIpfsApi, downloadIpfsApi, prepareSpecApi } from './api.js';

let configPromise = null;
export const loadIpfsConfig = () => {
  if (!configPromise) {
    configPromise = getIpfsConfigApi()
      .then((res) => res.data?.config || { enabled: false })
      .catch(() => {
        configPromise = null;
        return { enabled: false };
      });
  }
  return configPromise;
};

/** Upload a File/Blob; resolves with { cid, uri, name, size }. */
export const uploadFile = async (projectId, kind, file) => {
  try {
    return (await uploadIpfsApi(projectId, kind, file)).data.file;
  } catch (err) {
    throw new Error(err.response?.data?.message || err.message);
  }
};

/** Upload plain text as a small file (e.g. a dispute claim). */
export const uploadText = (projectId, kind, text, name) =>
  uploadFile(projectId, kind, new File([text], name, { type: 'text/plain' }));

/** Download and decrypt a file, then hand it to the browser as a normal download. */
export const downloadFile = async (cid, name = 'file') => {
  try {
    const res = await downloadIpfsApi(cid);
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (err) {
    let message = err.message;
    // Blob error bodies need to be read as text to show the server's message.
    if (err.response?.data instanceof Blob) {
      try { message = JSON.parse(await err.response.data.text()).message || message; } catch { /* keep default */ }
    }
    throw new Error(message);
  }
};

/** Agreed job terms stored on IPFS, for the escrow contract (MetaMask deploy path). */
export const prepareSpecUri = async (projectId) => {
  try {
    return (await prepareSpecApi(projectId)).data.uri;
  } catch {
    return null; // fall back to a plain reference
  }
};

export const shortCid = (cid) => (cid ? `${cid.slice(0, 10)}…${cid.slice(-6)}` : '');
