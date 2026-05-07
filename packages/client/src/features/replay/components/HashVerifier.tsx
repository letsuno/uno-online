import { useState } from 'react';
import { Shield, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';

interface HashVerifierProps {
  deckHash: string;
  initialDeck: string | null;
}

export default function HashVerifier({ deckHash, initialDeck }: HashVerifierProps) {
  const [status, setStatus] = useState<'idle' | 'verifying' | 'valid' | 'invalid'>('idle');

  const verify = async () => {
    if (!initialDeck) {
      setStatus('invalid');
      return;
    }
    setStatus('verifying');
    const encoder = new TextEncoder();
    const data = encoder.encode(initialDeck);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const computedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    setStatus(computedHash === deckHash ? 'valid' : 'invalid');
  };

  return (
    <div className="flex items-center gap-2">
      {status === 'idle' && (
        <Button variant="ghost" size="sm" onClick={verify}>
          <Shield size={14} className="mr-1" /> 验证牌序公平性
        </Button>
      )}
      {status === 'verifying' && (
        <span className="text-xs text-muted-foreground">验证中...</span>
      )}
      {status === 'valid' && (
        <span className="text-xs text-uno-green flex items-center gap-1">
          <ShieldCheck size={14} /> 牌序验证通过
        </span>
      )}
      {status === 'invalid' && (
        <span className="text-xs text-destructive flex items-center gap-1">
          <ShieldAlert size={14} /> 牌序验证失败
        </span>
      )}
      <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px]" title={deckHash}>
        {deckHash.slice(0, 16)}...
      </span>
    </div>
  );
}
