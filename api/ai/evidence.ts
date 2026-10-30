export const evidenceLibrary = [
  {
    id: 1,
    title: "Effects of the Dietary Approach to Stop Hypertension (DASH) diet on cardiovascular risk factors: a systematic review and meta-analysis",
    authors: "Siervo M, Lara J, Chowdhury S, et al.",
    year: 2015,
    publication: "British Journal of Nutrition",
    url: "https://www.cambridge.org/core/journals/british-journal-of-nutrition/article/effects-of-the-dietary-approach-to-stop-hypertension-dash-diet-on-cardiovascularrisk-factors-a-systematic-review-and-metaanalysis/C3B37FC59A6FE257F3750C429C1251E6",
    summary: "A systematic review of randomized trials examining DASH-style eating and cardiovascular risk factors. It is general population evidence, not an individual prescription.",
    topics: ["dash", "blood pressure", "hypertension", "sodium", "diet", "food", "nutrition"],
  },
  {
    id: 2,
    title: "Long-term impact of Mediterranean diet on cardiovascular disease prevention: A systematic review and meta-analysis of randomized controlled trials",
    authors: "Sebastian SA, Padda I, Johal G, et al.",
    year: 2024,
    publication: "Current Problems in Cardiology",
    url: "https://www.sciencedirect.com/science/article/pii/S0146280624001488",
    summary: "A review of randomized evidence about Mediterranean-style eating and long-term cardiovascular prevention. Individual suitability still depends on the care plan, medicines, kidney function, allergies, and other conditions.",
    topics: ["mediterranean", "cardiovascular", "heart", "diet", "food", "nutrition", "lifestyle"],
  },
  {
    id: 3,
    title: "5-year follow-up of the randomised Diabetes Remission Clinical Trial (DiRECT) of continued support for weight loss maintenance in the UK: an extension study",
    authors: "Lean MEJ, Leslie WS, Barnes AC, et al.",
    year: 2024,
    publication: "The Lancet Diabetes & Endocrinology",
    url: "https://www.thelancet.com/journals/landia/article/PIIS2213-8587(23)00385-6/fulltext",
    summary: "An extension study of continued weight-management support after a primary-care-led diabetes trial. It must not be used to stop diabetes medication or to prescribe weight loss for an older adult without clinician supervision.",
    topics: ["diabetes", "glucose", "weight", "direct", "lifestyle", "remission", "nutrition"],
  },
  {
    id: 4,
    title: "Research directions in the clinical implementation of pharmacogenomics: an overview of US programs and projects",
    authors: "Volpi S, Bult CJ, Chisholm RL, et al.",
    year: 2018,
    publication: "Clinical Pharmacology & Therapeutics",
    url: "https://ascpt.onlinelibrary.wiley.com/doi/abs/10.1002/cpt.1048",
    summary: "An overview of clinical pharmacogenomics implementation, including the need for validated variant interpretation and guideline-based workflows. Consumer DNA output is not a stand-alone medication decision.",
    topics: ["dna", "genetic", "genomic", "pharmacogenomic", "pharmacogenetic", "cpic", "variant", "medication"],
  },
] as const;

export type EvidenceSource = (typeof evidenceLibrary)[number];

export function selectEvidence(question: string) {
  const normalized = question.toLowerCase();
  const matches = evidenceLibrary.filter((source) => source.topics.some((topic) => normalized.includes(topic)));
  return (matches.length ? matches : evidenceLibrary.slice(0, 2)).slice(0, 4);
}
