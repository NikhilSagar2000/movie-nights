// PLACEHOLDER
import type { Who } from "../shared/types";
export function Login(_: { onIn: (who: Who) => void }) { return <main className="center-screen">login</main>; }
export function ProfilePicker() { return <main className="center-screen">profile</main>; }
export function Door({ onEnter }: { onEnter: () => void }) { return <main className="center-screen"><button className="btn" onClick={onEnter}>Come in 🚪</button></main>; }
