import app from '../hono/hono';
import result from "../model/result";
import oauthService from "../service/oauth-service";

app.post('/oauth/linuxDo/start', async (c) => {
	const startInfo = await oauthService.linuxDoStart(c);
	return c.json(result.ok(startInfo));
});

app.post('/oauth/linuxDo/login', async (c) => {
	const loginInfo = await oauthService.linuxDoLogin(c, await c.req.json());
	return c.json(result.ok(loginInfo))
});

app.put('/oauth/bindUser', async (c) => {
	const loginInfo = await oauthService.bindUser(c, await c.req.json());
	return c.json(result.ok(loginInfo))
})
