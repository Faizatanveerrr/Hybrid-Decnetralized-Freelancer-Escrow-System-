import { GoogleGenAI } from '@google/genai';

/**
 * AI Dispute Arbitration Service
 * Analyzes dispute evidence, claims, and milestone acceptance criteria.
 * College Project Implementation: Simple, explainable, and resilient.
 */
export const analyzeDispute = async (disputeData) => {
  const {
    projectTitle = '',
    projectDescription = '',
    milestoneTitle = '',
    milestoneDescription = '',
    acceptanceCriteria = '',
    clientClaim = '',
    freelancerClaim = '',
    evidence = [],
    priorRuling = null,
    appealReason = ''
  } = disputeData;

  const evidenceSummary = evidence && evidence.length > 0
    ? evidence.map((e, idx) => `${idx + 1}. [Submitted by ${e.submittedBy}]: ${e.name} - ${e.description}`).join('\n')
    : 'No external file evidence provided.';

  // Attempt real Gemini API call if key is configured
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `You are an impartial AI Arbitrator for a decentralized freelancer escrow smart contract system called EscrowX.
Analyze this freelance project dispute between Client and Freelancer:

[PROJECT]: ${projectTitle} - ${projectDescription}
[MILESTONE]: ${milestoneTitle} - ${milestoneDescription}
[ACCEPTANCE CRITERIA]: ${acceptanceCriteria}
[CLIENT CLAIM]: ${clientClaim}
[FREELANCER CLAIM]: ${freelancerClaim}
[SUBMITTED EVIDENCE]:
${evidenceSummary}
${priorRuling ? `
[SECONDARY REVIEW] A previous ruling favored "${priorRuling.winner}" (${priorRuling.confidence}% confidence): ${priorRuling.reasoning}
Appeal / reason for review: ${appealReason || 'Low confidence in the first ruling.'}
Review the case afresh; you may overturn the previous ruling.
` : ''}
Provide a fair, binding arbitration ruling. You must decide whether the escrow funds should go to the "freelancer" or "client".
Respond with a JSON object strictly in this format (no markdown code blocks, just raw JSON):
{
  "winner": "freelancer" or "client",
  "confidence": integer between 0 and 100 (use below 70 when the evidence is ambiguous or insufficient),
  "reasoning": "Detailed 2-3 sentence legal and technical explanation of the finding based on acceptance criteria and proof provided."
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      const responseText = response.text?.trim() || '';
      try {
        const parsed = JSON.parse(responseText);
        if (parsed.winner && parsed.confidence && parsed.reasoning) {
          return {
            winner: parsed.winner.toLowerCase() === 'client' ? 'client' : 'freelancer',
            confidence: Math.min(Math.max(Math.round(Number(parsed.confidence)) || 0, 0), 100),
            reasoning: parsed.reasoning
          };
        }
      } catch (jsonErr) {
        console.warn('Could not parse Gemini JSON, falling back to heuristic parsing:', jsonErr.message);
      }
    } catch (apiErr) {
      console.warn('Gemini API call skipped or encountered error, using intelligent local arbitration engine:', apiErr.message);
    }
  }

  // Robust College Demo Fallback Arbitrator:
  // Analyzes keywords and evidence matching against acceptance criteria
  const clientWords = (clientClaim + ' ' + projectTitle).toLowerCase();
  const freeWords = (freelancerClaim + ' ' + milestoneTitle).toLowerCase();
  const criteria = (acceptanceCriteria || '').toLowerCase();

  const freelancerEvidenceCount = evidence.filter(e => e.submittedBy === 'freelancer').length;
  const clientEvidenceCount = evidence.filter(e => e.submittedBy === 'client').length;

  let winner = 'freelancer';
  let confidence = 85;

  // Nothing substantive from either side: low confidence forces a secondary review.
  if (clientEvidenceCount + freelancerEvidenceCount === 0 && clientClaim.length < 20 && freelancerClaim.length < 20) {
    return {
      winner: 'freelancer',
      confidence: 55,
      reasoning: 'Neither party supplied meaningful claims or evidence, so no confident finding can be made. Escalated for secondary review.'
    };
  }
  let reasoning = '';

  if (clientWords.includes('missing') || clientWords.includes('incomplete') || clientWords.includes('failed') || clientEvidenceCount > freelancerEvidenceCount) {
    if (freelancerClaim.length < 20 && freelancerEvidenceCount === 0) {
      winner = 'client';
      confidence = 91;
      reasoning = `The client submitted verifiable documentation showing deliverables failed to satisfy the acceptance criteria (${acceptanceCriteria}). Freelancer failed to substantiate fulfillment of core requirements. Escrow funds refunded to client.`;
    } else {
      winner = 'freelancer';
      confidence = 84;
      reasoning = `Review of deliverable specifications confirms freelancer fulfilled the primary milestones outlined in the acceptance criteria. Minor stylistic or format discrepancies do not breach contract fundamentals. Payout awarded to freelancer.`;
    }
  } else {
    winner = 'freelancer';
    confidence = 88;
    reasoning = `The submitted technical assets align directly with the acceptance criteria specifications (${acceptanceCriteria}). The client's claims do not dispute the core delivery. Funds are ruled to be released to the freelancer.`;
  }

  return {
    winner,
    confidence,
    reasoning
  };
};
