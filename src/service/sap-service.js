const sql = require('mssql');
const axios = require('axios');

class SapService {
  constructor(server, dbUsername, dbPassword, sapUsername, sapPassword, baseUrl) {
    this.config = {
      server: server,
      database: '',
      user: dbUsername,
      password: dbPassword,
      options: {
        encrypt: true,
        trustServerCertificate: true,
        enableArithAbort: true
      },
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
      }
    };
    this.pool = null;
    this.baseUrl = baseUrl;
    this.sapUsername = sapUsername;
    this.sapPassword = sapPassword;
    this.sessionId = null;
    this.routeId = null;
  }

  async connect() {
    try {
      if (!this.pool) {
        console.log('[SAP DB] Conectando a la base de datos SAP...');
        this.pool = await sql.connect(this.config);
        console.log('[SAP DB] Conexión exitosa');
      }
      return this.pool;
    } catch (error) {
      console.error('[SAP DB ERROR] Error al conectar:', error.message);
      throw new Error(`Error al conectar a SAP DB: ${error.message}`);
    }
  }

  async login(companyDB) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/Login`,
        {
          CompanyDB: companyDB,
          UserName: this.sapUsername,
          Password: this.sapPassword
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          httpsAgent: new (require('https').Agent)({
            rejectUnauthorized: false
          })
        }
      );

      console.log('[SAP API] Respuesta de login recibida:', response.data);

      // Extraer cookies de sesión
      const cookies = response.headers['set-cookie'];
      if (cookies) {
        cookies.forEach(cookie => {
          if (cookie.includes('B1SESSION=')) {
            this.sessionId = cookie.split('B1SESSION=')[1].split(';')[0];
          }
          if (cookie.includes('ROUTEID=')) {
            this.routeId = cookie.split('ROUTEID=')[1].split(';')[0];
          }
        });
      }

      console.log('[SAP API] Login exitoso');
      return true;
    } catch (error) {
      console.error('[SAP API ERROR] Error en login:', JSON.stringify(error.response));
      console.error('[SAP API ERROR] Error en login:', error.response?.data || error.message);
      throw new Error(`Error al hacer login en SAP API: ${error.message}`);
    }
  }

  async updateOrder(docEntry, campoActualizar, valorActualizado, dbName) {
    try {
      if (!this.sessionId) {
        throw new Error('No hay sesión activa. Debe hacer login primero.');
      }

      console.log(`[SAP API] Actualizando orden DocEntry: ${docEntry}, Campo: ${campoActualizar}, Valor: ${valorActualizado}`);

      const updateData = {};
      updateData[campoActualizar] = valorActualizado;

      const response = await axios.patch(
        `${this.baseUrl}/Orders(${docEntry})`,
        updateData,
        {
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `B1SESSION=${this.sessionId}; ROUTEID=${this.routeId}`
          },
          httpsAgent: new (require('https').Agent)({
            rejectUnauthorized: false
          })
        }
      );

      console.log(`[SAP API] Orden ${docEntry} actualizada exitosamente`);
      return true;
    } catch (error) {
      console.error(`[SAP API ERROR] Error al actualizar orden ${docEntry}:`, error.response?.data || error.message);
      throw new Error(`Error al actualizar orden en SAP API: ${error.message}`);
    }
  }

  async getLastOrders(dbs) {
    try {
      console.log('[SAP DB] Iniciando consulta de órdenes en bases de datos:', dbs);
      await this.connect();

      const dbArray = typeof dbs === 'string' ? JSON.parse(dbs) : dbs;
      console.log('[SAP DB] Bases de datos parseadas:', dbArray);

      const allRecordsWithDifference = [];

      for (const db of dbArray) {
        console.log(`[SAP DB] Iniciando consulta en base de datos: ${db}`);
        const selectResult = await this.pool.request()
          .query(`
          WITH DatosConDiferencia AS (
            SELECT
                a.DocEntry,
                a.docnum,
                a.docdate,
                a.doccur,
                a.DocTotal,
                a.doctotalfc,
                a.U_Monto_Plazo1,
                a.U_Monto_Plazo2,
                a.U_Monto_Plazo3,
                a.U_TipoPlazo,
                a.U_CantPlazos,
                (ISNULL(a.U_Monto_Plazo1, 0) + ISNULL(a.U_Monto_Plazo2, 0) + ISNULL(a.U_Monto_Plazo3, 0)) AS SumaPlazos,
                CASE WHEN a.doccur = 'USD' THEN
                    (a.DocTotalFC - (ISNULL(a.U_Monto_Plazo1, 0) + ISNULL(a.U_Monto_Plazo2, 0) + ISNULL(a.U_Monto_Plazo3, 0)))
                ELSE
                    (a.DocTotal - (ISNULL(a.U_Monto_Plazo1, 0) + ISNULL(a.U_Monto_Plazo2, 0) + ISNULL(a.U_Monto_Plazo3, 0)))
                END AS Diferencia
            FROM 
              ${db}.dbo.ordr a
             inner join SBO_Sistemas_logisticos.dbo.OCRD b
                  on b.CardCode =a.CardCode

                  WHERE
                      CAST(a.docdate AS DATE) >= '2025-11-25'
                      AND b.U_TipoPlazo NOT IN (5)
              )
              SELECT *
              FROM DatosConDiferencia
              WHERE Diferencia <> 0
              ORDER BY docnum DESC
        `);

        console.log(`[SAP DB] DB: ${db} - Registros con diferencia encontrados: ${selectResult.recordset.length}`);

        for (const record of selectResult.recordset) {
          let campoActualizar = 'U_Monto_Plazo1';
          if (record.U_CantPlazos === 2) {
            campoActualizar = 'U_Monto_Plazo2';
          } else if (record.U_CantPlazos === 3) {
            campoActualizar = 'U_Monto_Plazo3';
          }

          const valorActual = record[campoActualizar] || 0;
          const nuevoValor = valorActual + record.Diferencia;

          console.log(`[SAP DB] ========================================`);
          console.log(`[SAP DB] DocEntry ${record.DocEntry} - DocNum ${record.docnum}`);
          console.log(`[SAP DB]   Moneda (doccur): ${record.doccur}`);
          console.log(`[SAP DB]   DocTotal: ${record.DocTotal}`);
          console.log(`[SAP DB]   DocTotalFC: ${record.doctotalfc}`);
          console.log(`[SAP DB]   U_Monto_Plazo1: ${record.U_Monto_Plazo1}`);
          console.log(`[SAP DB]   U_Monto_Plazo2: ${record.U_Monto_Plazo2}`);
          console.log(`[SAP DB]   U_Monto_Plazo3: ${record.U_Monto_Plazo3}`);
          console.log(`[SAP DB]   U_CantPlazos: ${record.U_CantPlazos}`);
          console.log(`[SAP DB]   SumaPlazos: ${record.SumaPlazos}`);
          console.log(`[SAP DB]   Diferencia: ${record.Diferencia}`);
          console.log(`[SAP DB]   Campo a ajustar: ${campoActualizar}`);
          console.log(`[SAP DB]   Valor actual: ${valorActual}`);
          console.log(`[SAP DB]   Nuevo valor: ${nuevoValor}`);
          console.log(`[SAP DB] ========================================`);

          allRecordsWithDifference.push({
            ...record,
            campoActualizar: campoActualizar,
            valorActual: valorActual,
            nuevoValor: nuevoValor,
            dbName: db
          });
        }
      }

      console.log(`[SAP DB] Total de registros con diferencia: ${allRecordsWithDifference.length}`);

      // Agrupar por base de datos
      const groupedByDB = {};
      allRecordsWithDifference.forEach(record => {
        if (!groupedByDB[record.dbName]) {
          groupedByDB[record.dbName] = [];
        }
        groupedByDB[record.dbName].push(record);
      });

      return groupedByDB;
    } catch (error) {
      console.error('[SAP DB ERROR] Error en consulta:', error.message);
      throw new Error(`Error al consultar ORDR: ${error.message}`);
    }
  }

  async close() {
    try {
      if (this.pool) {
        await this.pool.close();
        this.pool = null;
        console.log('[SAP DB] Conexión cerrada');
      }
    } catch (error) {
      console.error('[SAP DB ERROR] Error al cerrar conexión:', error.message);
    }
  }
}

module.exports = SapService;
