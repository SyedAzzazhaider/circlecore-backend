const profileService = require('./profile.service');
const Profile        = require('./profile.model');
const User           = require('../auth/auth.model');

jest.mock('./profile.model');
jest.mock('../auth/auth.model');

const mockProfile = {
  _id:      'profile1',
  userId:   'user1',
  bio:      'Hello',
  avatar:   null,
  tier:     'free',
  isPublic: true,
};

beforeEach(() => jest.clearAllMocks());

describe('ProfileService.getProfile()', () => {
  it('throws 404 if profile not found', async () => {
    Profile.findOne.mockReturnValue({
      populate: jest.fn().mockResolvedValue(null),
    });
    await expect(profileService.getProfile('nonexistent'))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns profile if found', async () => {
    Profile.findOne.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockProfile),
    });
    const result = await profileService.getProfile('user1');
    expect(result).toMatchObject({ userId: 'user1' });
  });
});

describe('ProfileService.updateProfile()', () => {
  it('returns updated profile', async () => {
    const updated = { ...mockProfile, bio: 'Updated bio' };
    Profile.findOneAndUpdate.mockReturnValue({
      populate: jest.fn().mockResolvedValue(updated),
    });
    const result = await profileService.updateProfile('user1', { bio: 'Updated bio' });
    expect(result.bio).toBe('Updated bio');
  });

  it('throws 404 if profile not found after update', async () => {
    Profile.findOneAndUpdate.mockReturnValue({
      populate: jest.fn().mockResolvedValue(null),
    });
    await expect(profileService.updateProfile('user1', { bio: 'x' }))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});