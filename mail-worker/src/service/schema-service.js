import BizError from '../error/biz-error';
import KvConst from '../const/kv-const';

const schemaService = {
	async instanceEpoch(c) {
		const cached = await c.env.kv?.get(KvConst.INSTANCE_EPOCH);
		if (cached) return cached;
		const row = await c.env.db.prepare(`SELECT instance_epoch FROM schema_meta LIMIT 1`).first();
		if (!row?.instance_epoch) throw new BizError('Database not initialized', 503);
		await c.env.kv?.put(KvConst.INSTANCE_EPOCH, row.instance_epoch);
		return row.instance_epoch;
	}
};

export default schemaService;
