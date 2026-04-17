const express = require("express");
const {
  listSuggestionsHandler,
  createSuggestionHandler,
  updateSuggestionHandler,
  deleteSuggestionHandler,
} = require("../controllers/suggestionController");

const router = express.Router({ mergeParams: true });

router.get("/", listSuggestionsHandler);
router.post("/", createSuggestionHandler);
router.put("/:suggestionId", updateSuggestionHandler);
router.delete("/:suggestionId", deleteSuggestionHandler);

module.exports = router;

