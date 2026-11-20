'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const STORAGE_KEY = 'signage_device_code';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generatePairingCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

export default function PlayEntryPage() {
  const router = useRouter();

  useEffect(() => {
    let code = localStorage.getItem(STORAGE_KEY);
    if (!code || code.length !== 6) {
      code = generatePairingCode();
      localStorage.setItem(STORAGE_KEY, code);
    }
    router.replace(`/play/${code.toUpperCase()}`);
  }, [router]);

  return (
    <div className="w-screen h-screen bg-black text-slate-600 flex items-center justify-center cursor-none select-none">
      <span className="text-xs font-mono tracking-widest uppercase">
        Iniciando reproductor...
      </span>
    </div>
  );
}
