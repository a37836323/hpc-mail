import orm from '../entity/orm';
import perm from '../entity/perm';
import { eq, ne, and, asc } from 'drizzle-orm';
import rolePerm from '../entity/role-perm';
import user from '../entity/user';
import role from '../entity/role';
import { permConst } from '../const/entity-const';
import { t } from '../i18n/i18n'

const permService = {
	async tree(c) {
		const pList = await orm(c).select().from(perm).where(eq(perm.pid, 0)).orderBy(asc(perm.sort)).all();
		const cList = await orm(c).select().from(perm).where(ne(perm.pid, 0)).orderBy(asc(perm.sort)).all();

		cList.forEach(cItem => {
			cItem.name = t('perms.' + cItem.name)
		})

		pList.forEach(pItem => {
			pItem.name = t('perms.' + pItem.name)
			pItem.children = cList.filter(cItem => cItem.pid === pItem.permId)
		})
		return pList;
	},

	async userPermKeys(c, userId) {
		const userPerms = await orm(c).select({permKey: perm.permKey, permType: perm.type, roleKey: role.key}).from(user)
			.leftJoin(role, eq(role.roleId,user.type))
			.leftJoin(rolePerm, eq(rolePerm.roleId,role.roleId))
			.leftJoin(perm, eq(rolePerm.permId,perm.permId))
			.where(eq(user.userId,userId))
			.all();
		if (userPerms.some(item => item.roleKey === 'admin')) return ['*'];
		return userPerms.filter(item => item.permKey && item.permType === permConst.type.BUTTON).map(item => item.permKey);
	}
}

export default permService
