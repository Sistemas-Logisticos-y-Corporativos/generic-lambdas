const controller = require('../controllers/syncQuotaSAP.controller');
const { loadSecretsToEnv } = require('../utils/tools');
const log = require('loglevel');
log.setLevel(process.env.LOG_LEVEL || 'info');

const syncQuotaSAP = async (event) => {
    let response, prefix = '[syncQuotaSAP Handler] ';
    log.info(prefix + "Handler invoked");
    try {
        await loadSecretsToEnv();
        response = await controller.syncQuotaSAP();
    } catch (error) {
        log.error(`${prefix}Error: ${error.message}`);
        response = { statusCode: 500, body: 'Internal Server Error' };
    }
    return response;
};

module.exports = {
    syncQuotaSAP
}