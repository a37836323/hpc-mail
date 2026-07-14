import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { dbInit } from '../../src/init/init';

class D1StatementAdapter {
	constructor(database, sql, values = []) {
		this.database = database;
		this.sql = sql;
		this.values = values;
	}

	bind(...values) {
		return new D1StatementAdapter(this.database, this.sql, values);
	}

	async first() {
		return this.database.prepare(this.sql).get(...this.values) || null;
	}

	async all() {
		return { results: this.database.prepare(this.sql).all(...this.values) };
	}

	async run() {
		return this.database.prepare(this.sql).run(...this.values);
	}
}

function d1Adapter(database) {
	return {
		prepare(sql) {
			return new D1StatementAdapter(database, sql);
		},
		async batch(statements) {
			const results = [];
			for (const statement of statements) {
				results.push(await statement.run());
			}
			return results;
		}
	};
}

describe('v3.1 username migration', () => {
	it('is repeatable, prefers the main account name, and resolves collisions deterministically', async () => {
		const database = new DatabaseSync(':memory:');
		database.exec(`
			CREATE TABLE user (
				user_id INTEGER PRIMARY KEY AUTOINCREMENT,
				email TEXT NOT NULL
			);
			CREATE TABLE account (
				account_id INTEGER PRIMARY KEY AUTOINCREMENT,
				email TEXT NOT NULL,
				name TEXT NOT NULL DEFAULT '',
				user_id INTEGER NOT NULL
			);
			INSERT INTO user (email) VALUES ('admin@hpc.email'), ('other@hpc.email'), ('ops@hpc.email');
			INSERT INTO account (email, name, user_id) VALUES
				('admin@hpc.email', 'riba2534', 1),
				('other@hpc.email', 'riba2534', 2);
		`);

		const c = { env: { db: d1Adapter(database), admin: 'admin@hpc.email' } };
		await dbInit.v3_1DB(c);
		await dbInit.v3_1DB(c);

		const rows = database.prepare('SELECT user_id, username, display_name FROM user ORDER BY user_id').all();
		expect(rows).toEqual([
			{ user_id: 1, username: 'riba2534', display_name: 'riba2534' },
			{ user_id: 2, username: 'riba2534-2', display_name: 'riba2534' },
			{ user_id: 3, username: 'ops', display_name: 'ops' }
		]);
		expect(() => database.exec(`INSERT INTO user (email, username) VALUES ('duplicate@hpc.email', 'RIBA2534')`)).toThrow();
	});
});
