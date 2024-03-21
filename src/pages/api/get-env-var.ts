import type { NextApiRequest, NextApiResponse } from 'next';

export interface EnvVarResponse {
    value: string;
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<EnvVarResponse>
) {
    const value = process.env.BACKEND_HOST as string;
    res.status(200).json({ value });
}