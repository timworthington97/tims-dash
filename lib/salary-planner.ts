export interface SalaryPlannerOptions {
  annualSalary: number;
  monthlyExpenses: number;
  includeMedicareLevy: boolean;
  includeHelpRepayment: boolean;
  targetMonthlySavings?: number;
}

export interface TaxBreakdown {
  grossAnnualSalary: number;
  incomeTax: number;
  medicareLevy: number;
  helpRepayment: number;
  totalTaxAndRepayments: number;
}

export interface TakeHomeBreakdown {
  annual: number;
  monthly: number;
  fortnightly: number;
  weekly: number;
}

export interface SavingsProjection {
  monthlyExpenses: number;
  monthlySurplus: number;
  threeMonths: number;
  sixMonths: number;
  twelveMonths: number;
}

export interface TargetSalaryEstimate {
  targetMonthlySavings: number;
  requiredGrossSalary: number;
  monthlyTakeHome: number;
  monthlySurplus: number;
}

export interface SalaryPlannerResult {
  taxBreakdown: TaxBreakdown;
  takeHome: TakeHomeBreakdown;
  savingsProjection: SavingsProjection;
  targetSalaryEstimate: TargetSalaryEstimate | null;
}

interface TaxBracket {
  threshold: number;
  baseTax: number;
  rate: number;
}

export const AUSTRALIAN_TAX_YEAR = "2025-26";

// ATO Australian resident tax rates for 2025-26, excluding Medicare levy.
export const RESIDENT_TAX_BRACKETS_2025_26: TaxBracket[] = [
  { threshold: 190_000, baseTax: 51_638, rate: 0.45 },
  { threshold: 135_000, baseTax: 31_288, rate: 0.37 },
  { threshold: 45_000, baseTax: 4_288, rate: 0.3 },
  { threshold: 18_200, baseTax: 0, rate: 0.16 },
  { threshold: 0, baseTax: 0, rate: 0 },
];

// Latest ATO single low-income Medicare levy reduction thresholds available in the app.
export const MEDICARE_LEVY_2025_26 = {
  rate: 0.02,
  singleLowerThreshold: 27_222,
  singleUpperThreshold: 34_027,
  phaseInRate: 0.1,
};

// ATO 2025-26 study and training loan marginal repayment thresholds.
export const HELP_REPAYMENT_2025_26 = {
  minimumThreshold: 67_000,
  secondThreshold: 125_000,
  finalThreshold: 179_286,
  firstMarginalRate: 0.15,
  secondBaseRepayment: 8_700,
  secondMarginalRate: 0.17,
  highIncomeTotalRate: 0.1,
};

function money(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value * 100) / 100);
}

export function calculateAustralianResidentIncomeTax(taxableIncome: number) {
  const income = money(taxableIncome);
  const bracket = RESIDENT_TAX_BRACKETS_2025_26.find((candidate) => income > candidate.threshold) ?? RESIDENT_TAX_BRACKETS_2025_26.at(-1);

  if (!bracket) {
    return 0;
  }

  return money(bracket.baseTax + (income - bracket.threshold) * bracket.rate);
}

export function calculateMedicareLevy(taxableIncome: number) {
  const income = money(taxableIncome);
  const { rate, singleLowerThreshold, singleUpperThreshold, phaseInRate } = MEDICARE_LEVY_2025_26;

  if (income <= singleLowerThreshold) {
    return 0;
  }

  if (income < singleUpperThreshold) {
    return money((income - singleLowerThreshold) * phaseInRate);
  }

  return money(income * rate);
}

export function calculateHelpRepayment(repaymentIncome: number) {
  const income = money(repaymentIncome);
  const { minimumThreshold, secondThreshold, finalThreshold, firstMarginalRate, secondBaseRepayment, secondMarginalRate, highIncomeTotalRate } =
    HELP_REPAYMENT_2025_26;

  if (income <= minimumThreshold) {
    return 0;
  }

  if (income < secondThreshold) {
    return money((income - minimumThreshold) * firstMarginalRate);
  }

  if (income < finalThreshold) {
    return money(secondBaseRepayment + (income - secondThreshold) * secondMarginalRate);
  }

  return money(income * highIncomeTotalRate);
}

export function calculateSalaryPlanner(options: SalaryPlannerOptions): SalaryPlannerResult {
  const annualSalary = money(options.annualSalary);
  const monthlyExpenses = money(options.monthlyExpenses);
  const incomeTax = calculateAustralianResidentIncomeTax(annualSalary);
  const medicareLevy = options.includeMedicareLevy ? calculateMedicareLevy(annualSalary) : 0;
  const helpRepayment = options.includeHelpRepayment ? calculateHelpRepayment(annualSalary) : 0;
  const totalTaxAndRepayments = money(incomeTax + medicareLevy + helpRepayment);
  const netAnnual = money(annualSalary - totalTaxAndRepayments);
  const monthlySurplus = netAnnual / 12 - monthlyExpenses;

  const result: SalaryPlannerResult = {
    taxBreakdown: {
      grossAnnualSalary: annualSalary,
      incomeTax,
      medicareLevy,
      helpRepayment,
      totalTaxAndRepayments,
    },
    takeHome: {
      annual: netAnnual,
      monthly: money(netAnnual / 12),
      fortnightly: money(netAnnual / 26),
      weekly: money(netAnnual / 52),
    },
    savingsProjection: {
      monthlyExpenses,
      monthlySurplus: Math.round(monthlySurplus * 100) / 100,
      threeMonths: Math.round(monthlySurplus * 3 * 100) / 100,
      sixMonths: Math.round(monthlySurplus * 6 * 100) / 100,
      twelveMonths: Math.round(monthlySurplus * 12 * 100) / 100,
    },
    targetSalaryEstimate: null,
  };

  if (options.targetMonthlySavings && options.targetMonthlySavings > 0) {
    result.targetSalaryEstimate = estimateGrossSalaryForTarget({
      targetMonthlySavings: options.targetMonthlySavings,
      monthlyExpenses,
      includeMedicareLevy: options.includeMedicareLevy,
      includeHelpRepayment: options.includeHelpRepayment,
    });
  }

  return result;
}

export function estimateGrossSalaryForTarget(options: {
  targetMonthlySavings: number;
  monthlyExpenses: number;
  includeMedicareLevy: boolean;
  includeHelpRepayment: boolean;
}): TargetSalaryEstimate {
  const targetMonthlySavings = money(options.targetMonthlySavings);
  const monthlyExpenses = money(options.monthlyExpenses);
  let low = 0;
  let high = 400_000;

  for (let index = 0; index < 40; index += 1) {
    const midpoint = (low + high) / 2;
    const scenario = calculateSalaryPlanner({
      annualSalary: midpoint,
      monthlyExpenses,
      includeMedicareLevy: options.includeMedicareLevy,
      includeHelpRepayment: options.includeHelpRepayment,
    });

    if (scenario.savingsProjection.monthlySurplus >= targetMonthlySavings) {
      high = midpoint;
    } else {
      low = midpoint;
    }
  }

  const requiredGrossSalary = Math.ceil(high / 100) * 100;
  const scenario = calculateSalaryPlanner({
    annualSalary: requiredGrossSalary,
    monthlyExpenses,
    includeMedicareLevy: options.includeMedicareLevy,
    includeHelpRepayment: options.includeHelpRepayment,
  });

  return {
    targetMonthlySavings,
    requiredGrossSalary,
    monthlyTakeHome: scenario.takeHome.monthly,
    monthlySurplus: scenario.savingsProjection.monthlySurplus,
  };
}
