const lambda = require('./lambda')

test('auth', async () => {
    await expect(lambda.handler({ "protocolData": { "mqtt": { "username": "aladdin", "password": "b3BlbnNlc2FtZQ==" } } })).resolves.toMatchObject({"isAuthenticated": true})
})