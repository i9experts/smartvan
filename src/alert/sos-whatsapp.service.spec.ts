/* eslint-disable prettier/prettier */
import { Types } from 'mongoose';
import { SosWhatsappService } from './sos-whatsapp.service';

const oid = () => new Types.ObjectId();
const chain = (rows: any) => { const c: any = { sort: () => c, lean: async () => rows }; return c; };

function setup(opts: { previousBatchAt?: Date } = {}) {
  const p1 = { _id: oid(), phoneNo: '03001111111' };
  const p2 = { _id: oid(), phoneNo: '+923001111111' }; // duplicate of p1
  const p3 = { _id: oid(), phoneNo: '03002222222' };
  const kids = [{ parentId: p1._id, fullname: 'Fatima' }, { parentId: p2._id, fullname: 'Ali' }, { parentId: p3._id, fullname: 'Sara' }];
  const updates: any[] = [];
  const repos: any = {
    notificationModel: {
      findOne: () => chain(opts.previousBatchAt ? { whatsappBatchAt: opts.previousBatchAt } : null),
      updateOne: async (_f: any, u: any) => { updates.push(u.$set); },
    },
    routeModel: { findById: () => chain({ kidLocations: kids.map(() => ({ kidId: oid() })) }), find: () => chain([]) },
    KidModel: { find: () => chain(kids) },
    parentModel: { find: () => chain([p1, p2, p3]) },
    SchoolModel: { findById: () => chain({ contactNumber: '03002517280' }) },
  };
  const whatsapp: any = {
    sendTemplate: jest.fn(async (to: string) => (to.endsWith('2222') ? { success: false, error: 'boom' } : { success: true, messageId: 'wamid.1' })),
  };
  const svc = new SosWhatsappService({ repositories: repos } as any, whatsapp);
  const input: any = {
    alertId: oid().toString(), trip: { _id: oid(), schoolId: oid().toString(), routeId: oid().toString(), kids: [] }, van: { _id: oid(), carNumber: 'KHI-1' },
    driverName: 'Ali', lat: 24.86, lng: 67.01, at: new Date('2026-10-15T03:42:00Z'),
  };
  return { svc, whatsapp, updates, input, repos };
}

describe('SosWhatsappService', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it('does nothing when the flag is set to false', async () => {
    process.env.SOS_WHATSAPP_ENABLED = 'false';
    const { svc, whatsapp, updates, input } = setup();
    await svc.notifyParents(input);
    expect(whatsapp.sendTemplate).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it('sends once per unique number with ordered params and records per-recipient results', async () => {
    process.env.SOS_WHATSAPP_ENABLED = 'true';
    delete process.env.WHATSAPP_SOS_TEMPLATE; // defaults to smartvan_sos
    const { svc, whatsapp, updates, input } = setup();
    await svc.notifyParents(input);
    expect(whatsapp.sendTemplate).toHaveBeenCalledTimes(2);
    expect(whatsapp.sendTemplate).toHaveBeenCalledWith('+923001111111', 'smartvan_sos', 'en',
      ['Fatima, Ali', 'KHI-1', '+923002517280']);
    const saved = updates.find((u) => u.whatsappNotifications).whatsappNotifications;
    expect(saved.map((r: any) => r.status)).toEqual(['sent', 'failed']);
    expect(saved[0].messageId).toBe('wamid.1');
    expect(saved[1].error).toBe('boom');
  });

  it('is throttled when a batch for the same trip went out < 5 min ago', async () => {
    process.env.SOS_WHATSAPP_ENABLED = 'true';
    process.env.WHATSAPP_SOS_TEMPLATE = 't';
    const { svc, whatsapp, updates, input } = setup({ previousBatchAt: new Date('2026-10-15T03:39:00Z') });
    await svc.notifyParents(input);
    expect(whatsapp.sendTemplate).not.toHaveBeenCalled();
    expect(updates[0].whatsappSkipped).toBe('throttled');
  });

  it('never throws', async () => {
    process.env.SOS_WHATSAPP_ENABLED = 'true';
    process.env.WHATSAPP_SOS_TEMPLATE = 't';
    const { svc, repos, input } = setup();
    repos.notificationModel.findOne = () => { throw new Error('db down'); };
    await expect(svc.notifyParents(input)).resolves.toBeUndefined();
  });
});
