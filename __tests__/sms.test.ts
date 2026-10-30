import { matchCard, parseBankSms } from '../src/lib/sms';

const today = '2026-10-30';

describe('parseBankSms', () => {
  it('ignores OTP messages entirely', () => {
    expect(parseBankSms('123456 is your OTP for txn of INR 5,000.00 at AMAZON on HDFC Bank card xx1234. Do not share.', today)).toBeNull();
    expect(parseBankSms('Your one time password for purchase of Rs 999 on ICICI card XX4321 is 445566', today)).toBeNull();
  });

  it('HDFC style', () => {
    const p = parseBankSms('Spent Rs.1,250.50 On HDFC Bank Card 1234 At BIGBASKET On 2026-10-28:14:22:05. Not You? Call 18002586161', today)!;
    expect(p).toMatchObject({ amount: 1250.5, last4: '1234', date: '2026-10-28', isRefund: false });
    expect(p.merchant).toBe('BIGBASKET');
  });

  it('ICICI style', () => {
    const p = parseBankSms('INR 3,499.00 spent using ICICI Bank Card XX9876 on 27-Oct-26 on MAKEMYTRIP. Avl Limit: INR 1,20,000.00.', today)!;
    expect(p).toMatchObject({ amount: 3499, last4: '9876', date: '2026-10-27' });
  });

  it('generic "at merchant" style with dd/mm/yyyy', () => {
    const p = parseBankSms('Rs 820.00 debited on your Federal Bank Credit Card ending 5566 at SWIGGY on 29/10/2026.', today)!;
    expect(p).toMatchObject({ amount: 820, last4: '5566', merchant: 'SWIGGY', date: '2026-10-29' });
  });

  it('refunds are negative', () => {
    const p = parseBankSms('Refund of INR 500.00 from AMAZON credited to your ICICI Bank Credit Card XX9876 on 30-Oct-26.', today)!;
    expect(p.amount).toBe(-500);
    expect(p.isRefund).toBe(true);
  });

  it('skips payment received and bill messages', () => {
    expect(parseBankSms('Payment of Rs 12,000 received on your HDFC Bank Credit Card 1234. Thank you.', today)).toBeNull();
    expect(parseBankSms('Your ICICI Bank Credit Card XX9876 statement is generated. Total due Rs 5,000. Min due Rs 250', today)).toBeNull();
  });

  it('falls back to received date', () => {
    const p = parseBankSms('Rs 100 spent on IndusInd Card XX1111 at CRED.', today)!;
    expect(p.date).toBe(today);
  });
});

describe('matchCard', () => {
  const cards = [
    { id: 1, last4: '9876', bank: 'ICICI Bank', names: ['icici'] },
    { id: 2, last4: '1234', bank: 'HDFC Bank', names: ['hdfc'] },
  ];
  it('by last 4', () => {
    const p = parseBankSms('Spent Rs.100 On HDFC Bank Card 1234 At X On 2026-10-28', today)!;
    expect(matchCard(p, cards, (c) => c.names)?.id).toBe(2);
  });
  it('by issuer when last 4 missing', () => {
    const p = { amount: 1, last4: null, merchant: 'x', date: today, isRefund: false, raw: 'ICICI Bank card spent', sender: 'AX-ICICIT' };
    expect(matchCard(p, cards, (c) => c.names)?.id).toBe(1);
  });
});
