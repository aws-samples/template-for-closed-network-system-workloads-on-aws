import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { getSession } from "../utils/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // Check the state of authentication
  const session = await getSession(request.headers.get('Cookie'));
  const user = session.get('user');
  
  // User is authenticated, redirect to dashboard
  if (user) {
    return redirect("/dashboard");
  }
  
  // User is not authenticated, redirect to login
  return redirect("/login");
}

// This component is not actually rendered (because of the redirect)
export default function Index() {
  return null;
}
