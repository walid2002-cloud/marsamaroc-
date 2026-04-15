const express = require("express");
const {
  listSourcesHandler,
  createTextSourceHandler,
  createPdfSourceHandler,
  createApiSourceHandler,
  updateSourceHandler,
  processSourceHandler,
  listApiLogsHandler,
} = require("../controllers/sourceController");
const { uploadBotSourcePdf } = require("../middlewares/uploadMiddleware");

const router = express.Router({ mergeParams: true });

router.get("/", listSourcesHandler);
router.get("/logs/api", listApiLogsHandler);
router.post("/text", createTextSourceHandler);
router.post("/pdf", uploadBotSourcePdf.single("file"), createPdfSourceHandler);
router.post("/api", createApiSourceHandler);
router.put("/:sourceId", updateSourceHandler);
router.post("/:sourceId/process", processSourceHandler);

module.exports = router;

