const { findAdminByCredentials } = require("../models/adminModel");

async function loginAdmin(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email et mot de passe requis." });
    }
    const admin = await findAdminByCredentials(email, password);
    if (!admin) {
      return res.status(401).json({ error: "Identifiants admin invalides." });
    }
    return res.status(200).json({
      message: "Connexion admin réussie.",
      admin: {
        id: admin.id,
        name: admin.full_name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { loginAdmin };

