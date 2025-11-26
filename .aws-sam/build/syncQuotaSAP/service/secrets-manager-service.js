const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

class SecretsManagerService {
  constructor() {
    this.client = new SecretsManagerClient();
  }

  async getSecrets(secretName) {
    try {
      const command = new GetSecretValueCommand({ SecretId: secretName });
      const response = await this.client.send(command);

      if (!response.SecretString) {
        throw new Error(`Secret '${secretName}' no contiene un string JSON válido.`);
      }

      const secrets = JSON.parse(response.SecretString);

      //console.log(`[SecretsManager] Secret '${JSON.stringify(secrets)}' obtenido exitosamente.`);

      return {
        SAP_SERVER: secrets.SAP_BASE_URL_DB || '',
        SAP_BASE_URL: secrets.SAP_BASE_URL || '',
        SAP_USERNAME_DB: secrets.SAP_USERNAME_DB || '',
        SAP_PASSWORD_DB: secrets.SAP_PASSWORD_DB || '',
        SAP_USERNAME: secrets.SAP_USERNAME || '',
        SAP_PASSWORD: secrets.SAP_PASSWORD || '',
        SAP_DBS: secrets.SAP_DBS || ''
      };
    } catch (error) {
      throw new Error(`Error obteniendo secretos: ${error.message}`);
    }
  }
}

module.exports = SecretsManagerService;
