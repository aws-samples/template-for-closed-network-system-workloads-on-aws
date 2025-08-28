import { createCookieSessionStorage } from 'react-router'

if (!process.env.SESSION_SECRET) {
	throw new Error('SESSION_SECRET is not set.')
}

export const sessionStorage = createCookieSessionStorage({
	cookie: {
		name: '_auth',
		sameSite: 'lax',
		path: '/',
		httpOnly: true,
		secrets: [process.env.SESSION_SECRET],
		secure: process.env.NODE_ENV === 'production',
		maxAge: 3600,	
	},
})

export const { getSession, commitSession, destroySession } = sessionStorage
