"use client";

import { useSearchParams } from 'next/navigation';
import '@/public/styles/characters.scss';

export default function Profile() {
  const character = () => {
    const searchParams = useSearchParams();
    return searchParams.get('character');
  }

  return (
    <div id="profile">
      { character }
    </div>
  );
}
