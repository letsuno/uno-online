import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfileModalStore } from '@/shared/stores/profile-modal-store';

export default function ProfilePage() {
  const navigate = useNavigate();
  const open = useProfileModalStore((s) => s.open);

  useEffect(() => {
    navigate('/lobby', { replace: true });
    open();
  }, []);

  return null;
}
