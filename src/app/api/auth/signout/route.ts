import { getAuth } from "@/lib/auth";
import { errorResponse, json } from "@/lib/api";

export async function POST() {
  try {
    const auth = await getAuth();
    await auth.signOut();
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
