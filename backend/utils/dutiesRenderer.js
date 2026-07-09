// backend/utils/dutiesRenderer.js
/**
 * Shared LaTeX builder for the "Duties and Responsibilities" clause
 * placeholder ({dutiesAndResponsibilities}). Used by both the real contract
 * PDF generator (routes/contracts.js) and the clause-group preview endpoint
 * (routes/positions.js) so the two stay in sync.
 *
 * Two numbering styles, chosen per position (and snapshotted per contract):
 *  - LETTER   (default/legacy): flat a) b) c) ... list.
 *  - NUMBERED: 1) 2) 3) ... top-level list, where each top-level duty may
 *    optionally have its own nested a) b) c) ... sub-items.
 */

/**
 * @param {Object} opts
 * @param {string[]} opts.duties - top-level duty strings.
 * @param {string[][]} [opts.subItems] - parallel array; subItems[i] are the
 *   lettered sub-items rendered under duties[i]. Only used in NUMBERED style.
 * @param {'LETTER'|'NUMBERED'} [opts.style]
 * @param {(text: string) => string} opts.escapeLatex
 * @param {(text: string, maxLength?: number) => string} opts.wrapLongText
 * @returns {string} LaTeX source for the enumerate block, or '' if there are no duties.
 */
export function buildDutiesLatex({ duties, subItems, style = 'LETTER', escapeLatex, wrapLongText }) {
  const list = duties || [];
  if (!list.some(d => d && d.trim())) return '';

  // Legal-document list punctuation: '.' on the very last item, '; and' on
  // the second-to-last, ';' on everything else.
  const suffixFor = (idx, len) => {
    if (idx === len - 1) return '.';
    if (idx === len - 2) return '; and';
    return ';';
  };

  if (style !== 'NUMBERED') {
    // ── LETTER (legacy/default): flat a) b) c) ... list ──
    let out = '\n\\begin{enumerate}[label=\\alph*),leftmargin=0.5in,itemsep=0pt,parsep=0pt,topsep=0pt]\n';
    list.forEach((duty, idx) => {
      if (!duty || !duty.trim()) return;
      const wrapped = wrapLongText(duty.trim(), 85);
      out += `\\item ${escapeLatex(wrapped)}${suffixFor(idx, list.length)}\n`;
    });
    out += '\\end{enumerate}';
    return out;
  }

  // ── NUMBERED: 1) 2) 3) ... with optional nested a) b) c) ... ──
  let out = '\n\\begin{enumerate}[label=\\arabic*),leftmargin=0.5in,itemsep=4pt,parsep=0pt,topsep=0pt]\n';
  list.forEach((duty, idx) => {
    if (!duty || !duty.trim()) return;
    const wrapped = wrapLongText(duty.trim(), 85);
    const subs = ((subItems && subItems[idx]) || []).filter(s => s && s.trim());
    const outerSuffix = suffixFor(idx, list.length);

    if (subs.length === 0) {
      out += `\\item ${escapeLatex(wrapped)}${outerSuffix}\n`;
    } else {
      // Main item ends with a colon since the lettered items below carry
      // the actual list punctuation (';' ... '; and' ... final suffix).
      out += `\\item ${escapeLatex(wrapped)}:\n`;
      out += '\\begin{enumerate}[label=\\alph*),leftmargin=0.5in,itemsep=0pt,parsep=0pt,topsep=2pt]\n';
      subs.forEach((sub, sIdx) => {
        const wrappedSub = wrapLongText(sub.trim(), 85);
        const subSuffix = sIdx === subs.length - 1 ? outerSuffix : ';';
        out += `\\item ${escapeLatex(wrappedSub)}${subSuffix}\n`;
      });
      out += '\\end{enumerate}\n';
    }
  });
  out += '\\end{enumerate}';
  return out;
}