const log = require('loglevel');
log.setLevel(process.env.LOG_LEVEL || 'info');
const { v4: uuidv4 } = require('uuid');
const SapService = require('../service/sap-service');

const createResponse = (trackingId, data) => ({ trackingId, ...data });

const syncQuotaSAP = async (event) => {
  const trackingId = uuidv4();
  const prefix = `[syncQuotaSAP - ${trackingId}] `;
  
  const sap = new SapService(
    process.env.SAP_SERVER,
    process.env.SAP_USERNAME_DB,
    process.env.SAP_PASSWORD_DB,
    process.env.SAP_USERNAME,
    process.env.SAP_PASSWORD,
    process.env.SAP_BASE_URL
  );
  
  log.info(prefix + 'sapService creado');

  try {
    // Consultar órdenes con diferencias - el query SQL ya calcula las diferencias
    log.info(prefix + 'Consultando órdenes con diferencias en dbo.ORDR');

    const ordersByDB = await sap.getLastOrders(process.env.SAP_DBS);
    
    const totalOrders = Object.values(ordersByDB).reduce((sum, orders) => sum + orders.length, 0);
    log.info(`${prefix}Consulta exitosa. Órdenes con diferencias encontradas: ${totalOrders} en ${Object.keys(ordersByDB).length} base(s) de datos`);

    const facturasAjustadas = [];
    const facturasConError = [];

    // Procesar cada base de datos independientemente
    for (const [dbName, orders] of Object.entries(ordersByDB)) {
      if (orders.length === 0) continue;

      try {
        log.info(`${prefix}Procesando DB: ${dbName} con ${orders.length} órdenes`);
        log.info(`${prefix}Haciendo login en SAP Service Layer para DB: ${dbName}`);
        
        await sap.login(dbName);
        log.info(`${prefix}Login exitoso para DB: ${dbName}`);
        
        // Procesar cada orden de esta DB
        for (const order of orders) {
          try {
            log.info(`${prefix}[${dbName}] Ajustando DocEntry ${order.DocEntry}, Campo: ${order.campoActualizar}, De ${order.valorActual} a ${order.nuevoValor}`);
            
            await sap.updateOrder(
              order.DocEntry,
              order.campoActualizar,
              order.nuevoValor,
              order.dbName
            );
            
            facturasAjustadas.push({
              DocEntry: order.DocEntry,
              DocNum: order.docnum,
              campoAjustado: order.campoActualizar,
              valorAnterior: order.valorActual,
              valorNuevo: order.nuevoValor,
              diferencia: order.Diferencia,
              dbName: order.dbName
            });
            
            log.info(`${prefix}[${dbName}] DocEntry ${order.DocEntry} ajustado exitosamente`);
          } catch (updateError) {
            log.error(`${prefix}[${dbName}] Error al ajustar DocEntry ${order.DocEntry}: ${updateError.message}`);
            facturasConError.push({
              DocEntry: order.DocEntry,
              DocNum: order.docnum,
              dbName: order.dbName,
              error: updateError.message
            });
          }
        }
        
        log.info(`${prefix}DB ${dbName} procesada: ${orders.length} órdenes`);
      } catch (loginError) {
        log.error(`${prefix}Error al hacer login en DB ${dbName}: ${loginError.message}`);
        // Agregar todas las órdenes de esta DB como error
        orders.forEach(order => {
          facturasConError.push({
            DocEntry: order.DocEntry,
            DocNum: order.docnum,
            dbName: dbName,
            error: `Login falló: ${loginError.message}`
          });
        });
      }
    }

    // Cerrar conexión DB
    await sap.close();

    const response = {
      status: 'SUCCESS'
    };

    // Armar respuesta según resultados
    if (facturasAjustadas.length > 0) {
      response.mensaje = `Se ajustaron ${facturasAjustadas.length} facturas mediante SAP Service Layer API`;
      response.facturasAjustadas = facturasAjustadas;
      log.info(`${prefix}${facturasAjustadas.length} facturas ajustadas exitosamente`);
    }

    if (facturasConError.length > 0) {
      response.advertencia = `${facturasConError.length} facturas no pudieron ser ajustadas`;
      response.facturasConError = facturasConError;
      log.warn(`${prefix}${facturasConError.length} facturas tuvieron errores al ajustar`);
    }

    if (facturasAjustadas.length === 0 && facturasConError.length === 0) {
      response.mensaje = 'No se encontraron órdenes con descuadre de totales en los plazos';
      log.info(`${prefix}No se encontraron inconsistencias`);
    }

    response.totalExaminadas = totalOrders;
    response.totalAjustadas = facturasAjustadas.length;
    response.totalConError = facturasConError.length;

    return createResponse(trackingId, response);

  } catch (error) {
    log.error(`${prefix}Error general en Lambda: ${error.message}`);
    
    // Intentar cerrar conexión en caso de error
    try {
      await sap.close();
    } catch (closeError) {
      log.error(`${prefix}Error al cerrar conexión: ${closeError.message}`);
    }

    return createResponse(trackingId, {
      status: 'ERROR',
      message: error.message
    });
  }
};

module.exports = {
  syncQuotaSAP
};