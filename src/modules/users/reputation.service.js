const Profile = require('./profile.model');
const logger = require('../../utils/logger');

/**
 * Reputation Service
 * Document requirement: MODULE B — Reputation Signals
 * Handles: post engagement, helpful votes, moderator badges, seniority
 */

class ReputationService {

  // Points awarded per action — industry standard scoring
  POINTS = {
    POST_REACTION_RECEIVED: 2,
    COMMENT_REACTION_RECEIVED: 1,
    HELPFUL_VOTE_RECEIVED: 5,
    POST_CREATED: 1,
    COMMENT_CREATED: 1,
    POST_REACTION_REMOVED: -2,
    COMMENT_REACTION_REMOVED: -1,
    HELPFUL_VOTE_REMOVED: -5,
  };

  /**
   * Update reputation when a post receives or loses a reaction
   * Called from post.service.js toggleReaction
   */
  async updatePostReactionReputation(authorId, isAdding) {
    try {
      const points = isAdding
        ? this.POINTS.POST_REACTION_RECEIVED
        : this.POINTS.POST_REACTION_REMOVED;

      await Profile.findOneAndUpdate(
        { userId: authorId },
        {
          $inc: {
            reputation: points,
            communityScore: points,
          },
        }
      );

      logger.info('Reputation updated for user: ' + authorId + ' points: ' + points);
    } catch (error) {
      logger.error('Reputation update failed (post reaction): ' + error.message);
    }
  }

  /**
   * Update reputation when a comment receives or loses a reaction
   * Called from comment.service.js toggleReaction
   */
  async updateCommentReactionReputation(authorId, isAdding) {
    try {
      const points = isAdding
        ? this.POINTS.COMMENT_REACTION_RECEIVED
        : this.POINTS.COMMENT_REACTION_REMOVED;

      await Profile.findOneAndUpdate(
        { userId: authorId },
        {
          $inc: {
            reputation: points,
            communityScore: points,
          },
        }
      );

      logger.info('Reputation updated for user: ' + authorId + ' points: ' + points);
    } catch (error) {
      logger.error('Reputation update failed (comment reaction): ' + error.message);
    }
  }

  /**
   * Update reputation when a helpful vote is added or removed on a comment
   * Called from comment.service.js toggleHelpfulVote
   */
  async updateHelpfulVoteReputation(authorId, isAdding) {
    try {
      const points = isAdding
        ? this.POINTS.HELPFUL_VOTE_RECEIVED
        : this.POINTS.HELPFUL_VOTE_REMOVED;

      await Profile.findOneAndUpdate(
        { userId: authorId },
        {
          $inc: {
            reputation: points,
            communityScore: points,
            helpfulVotesReceived: isAdding ? 1 : -1,
          },
        }
      );

      logger.info('Helpful vote reputation updated for user: ' + authorId + ' points: ' + points);
    } catch (error) {
      logger.error('Reputation update failed (helpful vote): ' + error.message);
    }
  }

  /**
   * Assign moderator badge to a user
   * Document requirement: Moderator badges
   * Called when user is promoted to moderator role
   */
  async assignBadge(userId, badgeType, label, awardedBy) {
    try {
      const profile = await Profile.findOne({ userId });
      if (!profile) throw new Error('Profile not found');

      // Prevent duplicate badges of same type
      const alreadyHas = profile.badges.some(b => b.type === badgeType);
      if (alreadyHas) {
        logger.info('Badge already assigned: ' + badgeType + ' to user: ' + userId);
        return profile;
      }

      profile.badges.push({
        type: badgeType,
        label: label,
        awardedAt: new Date(),
        awardedBy: awardedBy || null,
      });

      await profile.save();
      logger.info('Badge assigned: ' + badgeType + ' to user: ' + userId);
      return profile;
    } catch (error) {
      logger.error('Badge assignment failed: ' + error.message);
      throw error;
    }
  }

  /**
   * Remove a badge from a user
   * Called when user is demoted from moderator role
   */
  async removeBadge(userId, badgeType) {
    try {
      await Profile.findOneAndUpdate(
        { userId },
        { $pull: { badges: { type: badgeType } } }
      );
      logger.info('Badge removed: ' + badgeType + ' from user: ' + userId);
    } catch (error) {
      logger.error('Badge removal failed: ' + error.message);
    }
  }

  /**
   * Auto-assign top contributor badge based on reputation threshold
   * Document requirement: Reputation signals — post engagement
   */
  async checkAndAssignAutoBadge(userId) {
    try {
      const profile = await Profile.findOne({ userId });
      if (!profile) return;

      // Top contributor threshold — 100 reputation points
      if (profile.reputation >= 100) {
        await this.assignBadge(userId, 'top_contributor', 'Top Contributor', null);
      }

      // Senior member threshold — 500 reputation points + joined 30 days ago
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      if (profile.reputation >= 500 && new Date(profile.joinedAt) <= thirtyDaysAgo) {
        await this.assignBadge(userId, 'senior_member', 'Senior Member', null);
      }

      // Helpful member threshold — 10 helpful votes received
      if (profile.helpfulVotesReceived >= 10) {
        await this.assignBadge(userId, 'helpful', 'Helpful Member', null);
      }

    } catch (error) {
      logger.error('Auto badge check failed: ' + error.message);
    }
  }

  /**
   * Get full reputation summary for a user profile
   */
  async getReputationSummary(userId) {
    const profile = await Profile.findOne({ userId }).select(
      'reputation communityScore helpfulVotesReceived badges joinedAt'
    );
    if (!profile) throw Object.assign(new Error('Profile not found'), { statusCode: 404 });

    return {
      reputation: profile.reputation,
      communityScore: profile.communityScore,
      helpfulVotesReceived: profile.helpfulVotesReceived,
      badges: profile.badges,
      joinedAt: profile.joinedAt,
      memberSince: Math.floor((Date.now() - new Date(profile.joinedAt)) / (1000 * 60 * 60 * 24)),
    };
  }
}

module.exports = new ReputationService();