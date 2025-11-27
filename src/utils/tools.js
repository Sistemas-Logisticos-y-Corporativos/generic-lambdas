const log = require('loglevel');
const SecretsManagerService = require('../services/secrets-manager-service');

const loadSecretsToEnv = async () => {
  if (process.env.SECRETS_LOADED === 'true') {
    log.debug('Secretos ya cargados en memoria, usando caché');
    return;
  }

  const secretName = process.env.SECRET_NAME;
  if (!secretName) {
    throw new Error("Environment variable 'SECRET_NAME' not set.");
  }

  try {
    log.info(`Cargando secretos desde: ${secretName}`);
    const secretsService = new SecretsManagerService();
    const secrets = await secretsService.getSecrets(secretName);

    Object.entries(secrets).forEach(([key, value]) => {
      process.env[key] = value;
    });

    process.env.SECRETS_LOADED = 'true';
    
    log.info('Secretos cargados exitosamente en variables de entorno');
  } catch (error) {
    log.error(`Error cargando secretos: ${error.message}`);
    throw new Error(`Failed to load secrets: ${error.message}`);
  }
};


module.exports = {
  loadSecretsToEnv,
};
