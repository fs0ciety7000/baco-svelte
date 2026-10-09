"use client";

import { Copy, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createUser } from "@/app/(app)/admin/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { ROLE_LABEL } from "@/lib/team";

export const ROLE_CHOICES = [
  "user",
  "moderator",
  "otto_agent",
  "reader",
  "admin",
  "sysop",
] as const;
export const DISTRICT_CHOICES = ["", "Sud-Ouest", "Sud-Est", "Centre"] as const;

/** Mot de passe provisoire affiché une seule fois, à transmettre à l'agent (il le change dans « Mon profil »). */
export function PasswordReveal({ password, onClose }: { password: string; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        eyebrow="// Compte"
        title="Mot de passe provisoire"
        description="Il ne sera plus affiché. Transmets-le à l'agent, qui le changera dans « Mon profil »."
      >
        <p
          className="border border-border-strong bg-surface-2 px-3 py-3 text-center font-mono text-h3 tracking-wider select-all"
          data-testid="temp-password"
        >
          {password}
        </p>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() =>
              void navigator.clipboard
                .writeText(password)
                .then(() => toast.success("Mot de passe copié."))
                .catch(() => toast.error("Copie impossible."))
            }
          >
            <Copy aria-hidden /> Copier
          </Button>
          <Button onClick={onClose}>J&apos;ai transmis le mot de passe</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UserCreate() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [created, setCreated] = useState<{ id: string; password: string } | null>(null);
  const [f, setF] = useState({
    email: "",
    name: "",
    username: "",
    fonction: "",
    role: "user",
    district: "",
  });
  const submit = () =>
    start(async () => {
      const r = await createUser(f);
      if (!r.ok) return void toast.error(r.error);
      setOpen(false);
      setCreated(r.data);
      setF({ email: "", name: "", username: "", fonction: "", role: "user", district: "" });
    });
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus aria-hidden /> Nouveau compte
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          eyebrow="// Administration"
          title="Nouveau compte"
          description="Un mot de passe provisoire est généré et affiché une seule fois."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="E-mail" required className="sm:col-span-2">
              <Input
                type="email"
                value={f.email}
                onChange={(e) => setF({ ...f, email: e.target.value })}
                maxLength={200}
              />
            </Field>
            <Field label="Nom affiché" required>
              <Input
                value={f.name}
                onChange={(e) => setF({ ...f, name: e.target.value })}
                maxLength={200}
              />
            </Field>
            <Field label="Identifiant" hint="Facultatif, pour se connecter sans l'e-mail.">
              <Input
                value={f.username}
                onChange={(e) => setF({ ...f, username: e.target.value })}
                maxLength={100}
              />
            </Field>
            <Field label="Rôle">
              <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
                {ROLE_CHOICES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="District" hint="Donne le droit d'écrire la B201.">
              <Select value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })}>
                {DISTRICT_CHOICES.map((d) => (
                  <option key={d} value={d}>
                    {d || "Aucun"}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fonction" className="sm:col-span-2">
              <Input
                value={f.fonction}
                onChange={(e) => setF({ ...f, fonction: e.target.value })}
                maxLength={200}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={submit} loading={pending} disabled={!f.email.trim() || !f.name.trim()}>
              Créer le compte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {created ? (
        <PasswordReveal
          password={created.password}
          onClose={() => {
            const id = created.id;
            setCreated(null);
            router.push(`/admin/utilisateurs/${id}`);
          }}
        />
      ) : null}
    </>
  );
}
