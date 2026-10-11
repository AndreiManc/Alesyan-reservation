import { describe, expect, it } from 'vitest';
import { availableTable, getDuration, seedDemo, slots, withinService } from './domain';
describe('reservation availability (demo only)', () => {
  it('prevents overlapping reservations on the same table', () => {
    const d=seedDemo(), day=d.bookings[0].date;
    expect(availableTable(d.bookings,d.tables,day,'12:30',6,d.settings)?.id).toBe('t5');
    const taken=d.tables.filter(t=>t.capacity===2 && t.area==='Main Dining');
    expect(availableTable(d.bookings,taken,day,'12:30',2,d.settings)).toBeNull();
  });
  it('releases cancelled bookings', () => {
    const d=seedDemo(), day=d.bookings[0].date;
    expect(availableTable(d.bookings,d.tables.filter(t=>t.id==='t8'),day,'19:30',4,d.settings)?.id).toBe('t8');
  });
  it('validates party size and service opening times', () => {
    const d=seedDemo(), day=d.bookings[0].date;
    expect(availableTable(d.bookings,d.tables,day,'18:00',99,d.settings)).toBeNull();
    expect(withinService('23:00',d.settings)).toBe(false);
    expect(slots(d.bookings,d.tables,day,2,d.settings)).toContain('18:00');
    expect(getDuration(5,d.settings)).toBe(135);
  });
});
