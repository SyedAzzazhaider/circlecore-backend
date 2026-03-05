require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../modules/auth/auth.model');
const InviteCode = require('../modules/auth/inviteCode.model');
const Profile = require('../modules/users/profile.model');
const logger = require('../utils/logger');

const seed = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  logger.info('Connected to MongoDB');

  let admin = await User.findOne({ role: 'super_admin' });

  if (!admin) {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@circlecore.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@CircleCore1';
    logger.info('Creating admin: ' + adminEmail);

    admin = await User.create({
      name: 'Super Admin',
      email: adminEmail,
      password: adminPassword,
      role: 'super_admin',
      isEmailVerified: true
    });

    const profile = await Profile.create({ userId: admin._id });
    await User.findByIdAndUpdate(admin._id, { profileId: profile._id });
    logger.info('Super admin created: ' + admin.email);

  } else {
    logger.info('Super admin already exists: ' + admin.email);
  }

  const generatedCodes = [];

  for (let i = 0; i < 10; i++) {
    const invite = await InviteCode.create({
      createdBy: admin._id,
      maxUses: 1
    });
    generatedCodes.push(invite.code);
  }

  logger.info('Generated 10 invite codes:');

  for (let i = 0; i < generatedCodes.length; i++) {
    logger.info('  --> ' + generatedCodes[i]);
  }

  await mongoose.connection.close();
  logger.info('Seed complete.');
};

seed().catch(function(err) {
  console.error('Seed failed:', err.message);
  console.error(err);
  process.exit(1);
});