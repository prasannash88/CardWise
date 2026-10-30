import {
  addDays, cycleContaining, cycleInfo, nextStatementDate, payByDate, previousStatementDate, quarterRange,
  statementDateIn,
} from '../src/lib/dates';

describe('spec example: statement day 5, due gap 18, today 30 Oct', () => {
  const c = cycleInfo('2026-10-30', 5, 18);
  it('next statement 5 Nov', () => expect(c.nextStatement).toBe('2026-11-05'));
  it('6 days left to bill', () => expect(c.daysToStatement).toBe(6));
  it('due 23 Nov', () => expect(c.nextDue).toBe('2026-11-23'));
  it('24 interest-free days today', () => expect(c.interestFreeDays).toBe(24));
  it('best day 6 Nov gives 47 days', () => {
    expect(c.bestDayToBuy).toBe('2026-11-06');
    expect(c.bestDayInterestFree).toBe(47);
  });
  it('worst day 5 Nov gives 18 days', () => {
    expect(c.worstDayToBuy).toBe('2026-11-05');
    expect(c.worstDayInterestFree).toBe(18);
  });
  it('buying on 6 Nov lands on the 5 Dec bill, due 23 Dec', () => {
    const d = cycleInfo('2026-11-06', 5, 18);
    expect(d.nextStatement).toBe('2026-12-05');
    expect(d.nextDue).toBe('2026-12-23');
    expect(d.interestFreeDays).toBe(47);
  });
});

describe('statement days 29-31 in short months', () => {
  it('31 in February (non-leap) becomes 28 Feb', () => expect(statementDateIn(2027, 2, 31)).toBe('2027-02-28'));
  it('30 in February (leap) becomes 29 Feb', () => expect(statementDateIn(2028, 2, 30)).toBe('2028-02-29'));
  it('29 in February (non-leap) becomes 28 Feb', () => expect(statementDateIn(2026, 2, 29)).toBe('2026-02-28'));
  it('31 in April becomes 30 Apr', () => expect(statementDateIn(2026, 4, 31)).toBe('2026-04-30'));
  it('next statement from 10 Feb with day 31', () => expect(nextStatementDate('2027-02-10', 31)).toBe('2027-02-28'));
  it('next statement from 1 Mar with day 31 is 31 Mar', () => expect(nextStatementDate('2027-03-01', 31)).toBe('2027-03-31'));
  it('previous statement from 1 Mar with day 30 is 28 Feb', () => expect(previousStatementDate('2027-03-01', 30)).toBe('2027-02-28'));
  it('cycle after a clamped Feb statement starts 1 Mar', () =>
    expect(cycleContaining('2027-03-15', 30)).toEqual({ start: '2027-03-01', end: '2027-03-30' }));
  it('statement day 31: cycle containing 30 Apr ends 30 Apr', () =>
    expect(cycleContaining('2026-04-30', 31)).toEqual({ start: '2026-04-01', end: '2026-04-30' }));
  it('due date crosses year end', () => {
    const c = cycleInfo('2026-12-20', 29, 20);
    expect(c.nextStatement).toBe('2026-12-29');
    expect(c.nextDue).toBe('2027-01-18');
  });
  it('February interest-free days with day 29', () => {
    const c = cycleInfo('2026-03-01', 29, 18);
    expect(c.previousStatement).toBe('2026-02-28');
    expect(c.nextStatement).toBe('2026-03-29');
    expect(c.interestFreeDays).toBe(28 + 18);
  });
});

describe('statement day itself', () => {
  it('purchase on statement day lands on that bill', () => {
    const c = cycleInfo('2026-11-05', 5, 18);
    expect(c.nextStatement).toBe('2026-11-05');
    expect(c.daysToStatement).toBe(0);
    expect(c.interestFreeDays).toBe(18);
    expect(c.previousStatement).toBe('2026-10-05');
  });
});

describe('weekends and holidays', () => {
  it('Saturday due date warns Friday', () => expect(payByDate('2026-11-21')).toBe('2026-11-20'));
  it('Sunday due date warns Friday', () => expect(payByDate('2026-11-22')).toBe('2026-11-20'));
  it('weekday due date unchanged', () => expect(payByDate('2026-11-23')).toBe('2026-11-23'));
  it('holiday steps back', () => expect(payByDate('2026-11-23', ['2026-11-23'])).toBe('2026-11-20'));
});

describe('ranges', () => {
  it('quarter range', () => expect(quarterRange('2026-11-15')).toEqual({ start: '2026-10-01', end: '2026-12-31' }));
  it('addDays across leap day', () => expect(addDays('2028-02-28', 1)).toBe('2028-02-29'));
});
