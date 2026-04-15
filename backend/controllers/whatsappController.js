const botWhatsappManager = require("../services/botWhatsappManager");

async function initWhatsappHandler(req, res, next) {
  try {
    const botId = Number(req.params.id);
    const status = await botWhatsappManager.initBot(botId);
    return res.status(200).json(status);
  } catch (err) {
    return next(err);
  }
}

async function statusWhatsappHandler(req, res, next) {
  try {
    const botId = Number(req.params.id);
    const status = await botWhatsappManager.getStatus(botId);
    return res.status(200).json(status);
  } catch (err) {
    return next(err);
  }
}

async function qrWhatsappHandler(req, res, next) {
  try {
    const botId = Number(req.params.id);
    const status = await botWhatsappManager.getStatus(botId);
    return res.status(200).json({
      sessionStatus: status.sessionStatus,
      qrCodeData: status.qrCodeData || null,
      updatedAt: status.updatedAt || null,
    });
  } catch (err) {
    return next(err);
  }
}

async function disconnectWhatsappHandler(req, res, next) {
  try {
    const botId = Number(req.params.id);
    const status = await botWhatsappManager.disconnectBot(botId);
    return res.status(200).json(status);
  } catch (err) {
    return next(err);
  }
}

async function restartWhatsappHandler(req, res, next) {
  try {
    const botId = Number(req.params.id);
    const status = await botWhatsappManager.restartBot(botId);
    return res.status(200).json(status);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  initWhatsappHandler,
  statusWhatsappHandler,
  qrWhatsappHandler,
  disconnectWhatsappHandler,
  restartWhatsappHandler,
};

