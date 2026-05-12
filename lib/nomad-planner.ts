export interface NomadPlannerOptions {
  country: string;
  city?: string;
  currencyCode: string;
  audExchangeRate: number;
  monthlyRent: number;
  monthlyLivingExpenses: number;
  desiredMonthlySavings: number;
  monthlyBuffer: number;
}

export interface NomadMonthlyCosts {
  rent: number;
  livingExpenses: number;
  savingsTarget: number;
  buffer: number;
  breakEven: number;
  comfortable: number;
  safer: number;
}

export interface NomadIncomeTargets {
  breakEvenMonthly: number;
  comfortableMonthly: number;
  saferMonthly: number;
  breakEvenYearly: number;
  comfortableYearly: number;
  saferYearly: number;
  breakEvenMonthlyAud: number;
  comfortableMonthlyAud: number;
  saferMonthlyAud: number;
  breakEvenYearlyAud: number;
  comfortableYearlyAud: number;
  saferYearlyAud: number;
}

export interface NomadScenarioSummary {
  destinationLabel: string;
  currencyCode: string;
  audExchangeRate: number;
  summaryText: string;
  savingsText: string;
}

export interface NomadPlannerResult {
  monthlyCosts: NomadMonthlyCosts;
  incomeTargets: NomadIncomeTargets;
  scenarioSummary: NomadScenarioSummary;
}

function money(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value * 100) / 100);
}

export function calculateNomadPlanner(options: NomadPlannerOptions): NomadPlannerResult {
  const rent = money(options.monthlyRent);
  const livingExpenses = money(options.monthlyLivingExpenses);
  const savingsTarget = money(options.desiredMonthlySavings);
  const buffer = money(options.monthlyBuffer);
  const audExchangeRate = money(options.audExchangeRate) || 1;
  const breakEven = money(rent + livingExpenses);
  const comfortable = money(breakEven + savingsTarget);
  const safer = money(comfortable + buffer);
  const destinationLabel = [options.city?.trim(), options.country.trim()].filter(Boolean).join(", ") || "this destination";

  return {
    monthlyCosts: {
      rent,
      livingExpenses,
      savingsTarget,
      buffer,
      breakEven,
      comfortable,
      safer,
    },
    incomeTargets: {
      breakEvenMonthly: breakEven,
      comfortableMonthly: comfortable,
      saferMonthly: safer,
      breakEvenYearly: money(breakEven * 12),
      comfortableYearly: money(comfortable * 12),
      saferYearly: money(safer * 12),
      breakEvenMonthlyAud: money(breakEven * audExchangeRate),
      comfortableMonthlyAud: money(comfortable * audExchangeRate),
      saferMonthlyAud: money(safer * audExchangeRate),
      breakEvenYearlyAud: money(breakEven * 12 * audExchangeRate),
      comfortableYearlyAud: money(comfortable * 12 * audExchangeRate),
      saferYearlyAud: money(safer * 12 * audExchangeRate),
    },
    scenarioSummary: {
      destinationLabel,
      currencyCode: options.currencyCode,
      audExchangeRate,
      summaryText: `To live in ${destinationLabel}, you’d want about ${options.currencyCode} ${comfortable.toLocaleString("en-AU")} per month, roughly AUD ${money(comfortable * audExchangeRate).toLocaleString("en-AU")} at this rate.`,
      savingsText:
        savingsTarget > 0
          ? `That includes ${options.currencyCode} ${savingsTarget.toLocaleString("en-AU")} per month set aside as savings.`
          : "This scenario covers rent and living costs unless you add a savings goal.",
    },
  };
}
