import { roundMoney2 } from '@/utils/billingMoney';

function numberToWordsInt(n: number): string {
  const x = Math.floor(Math.abs(n));
  if (x === 0) return 'Zero';
  const ones = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function words(v: number): string {
    if (v < 20) return ones[v];
    if (v < 100) return tens[Math.floor(v / 10)] + (v % 10 ? ' ' + ones[v % 10] : '');
    if (v < 1000) return ones[Math.floor(v / 100)] + ' Hundred' + (v % 100 ? ' ' + words(v % 100) : '');
    if (v < 100000) return words(Math.floor(v / 1000)) + ' Thousand' + (v % 1000 ? ' ' + words(v % 1000) : '');
    if (v < 10000000) return words(Math.floor(v / 100000)) + ' Lakh' + (v % 100000 ? ' ' + words(v % 100000) : '');
    return words(Math.floor(v / 10000000)) + ' Crore' + (v % 10000000 ? ' ' + words(v % 10000000) : '');
  }
  return words(x);
}

/** INR amount as words (Rupees / Paise), same wording as sales bill print. */
export function inrAmountToWords(amount: number): string {
  const rupees = Math.floor(Math.abs(roundMoney2(amount)));
  const paise = Math.round(Math.abs(roundMoney2(amount) * 100 - rupees * 100));
  const core = numberToWordsInt(rupees);
  if (paise > 0) return `${core} Rupees and ${numberToWordsInt(paise)} Paise`;
  return `${core} Rupees Only`;
}
