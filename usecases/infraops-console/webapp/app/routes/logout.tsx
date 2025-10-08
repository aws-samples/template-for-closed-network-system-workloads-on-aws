import type { ActionFunctionArgs } from '@remix-run/node';
import { redirect } from '@remix-run/node';
import { sessionStorage } from '../utils/session.server';

export async function action({ request }: ActionFunctionArgs) {
  // Get the session
  const session = await sessionStorage.getSession(request.headers.get('Cookie'));
  
  try {
    // Destroy the session
    const cookie = await sessionStorage.destroySession(session);
    
    // Redirect to login page
    return redirect('/login', {
      headers: {
        'Set-Cookie': cookie,
      },
    });
  } catch (error) {
    console.error('Error during logout:', error);
    
    // Redirect to login page even if error occurs
    return redirect('/login', {
      headers: {
        'Set-Cookie': await sessionStorage.destroySession(session),
      },
    });
  }
}

export async function loader() {
  // Redirect to login page on GET request
  return redirect('/login');
}

export default function Logout() {
  return null;
}
