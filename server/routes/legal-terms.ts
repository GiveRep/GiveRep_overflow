import { Request, Response, Router } from 'express';
import { db } from '@db';
import { legalTermsAgreement } from '@db/legal_terms_schema';
import { eq, and } from 'drizzle-orm';

const router = Router();

// Check if user has agreed to terms
router.get('/check/:userHandle/:walletAddress', async (req: Request, res: Response) => {
  try {
    const { userHandle, walletAddress } = req.params;

    if (!userHandle || !walletAddress) {
      return res.status(400).json({ error: 'User handle and wallet address are required' });
    }

    const agreement = await db
      .select()
      .from(legalTermsAgreement)
      .where(
        and(
          eq(legalTermsAgreement.userHandle, userHandle.toLowerCase()),
          eq(legalTermsAgreement.walletAddress, walletAddress.toLowerCase())
        )
      )
      .limit(1);

    if (agreement.length > 0) {
      return res.json({
        hasAgreed: true,
        agreedAt: agreement[0].agreedAt,
        termsVersion: agreement[0].termsVersion,
      });
    }

    return res.json({ hasAgreed: false });
  } catch (error) {
    console.error('Error checking legal terms agreement:', error);
    return res.status(500).json({ error: 'Failed to check terms agreement' });
  }
});

// Record user agreement to terms
router.post('/agree', async (req: Request, res: Response) => {
  try {
    const { userHandle, walletAddress } = req.body;

    if (!userHandle || !walletAddress) {
      return res.status(400).json({ error: 'User handle and wallet address are required' });
    }

    // Check if agreement already exists
    const existingAgreement = await db
      .select()
      .from(legalTermsAgreement)
      .where(
        and(
          eq(legalTermsAgreement.userHandle, userHandle.toLowerCase()),
          eq(legalTermsAgreement.walletAddress, walletAddress.toLowerCase())
        )
      )
      .limit(1);

    if (existingAgreement.length > 0) {
      return res.json({
        success: true,
        message: 'Agreement already recorded',
        agreedAt: existingAgreement[0].agreedAt,
      });
    }

    // Get IP address and user agent
    const ipAddress = req.headers['x-forwarded-for'] as string || req.ip || '';
    const userAgent = req.headers['user-agent'] || '';

    // Record new agreement
    const result = await db
      .insert(legalTermsAgreement)
      .values({
        userHandle: userHandle.toLowerCase(),
        walletAddress: walletAddress.toLowerCase(),
        ipAddress,
        userAgent,
      })
      .returning();

    return res.json({
      success: true,
      message: 'Agreement recorded successfully',
      agreedAt: result[0].agreedAt,
    });
  } catch (error) {
    console.error('Error recording legal terms agreement:', error);
    return res.status(500).json({ error: 'Failed to record terms agreement' });
  }
});

export default router;