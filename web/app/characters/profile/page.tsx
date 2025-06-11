"use client";

import { useSearchParams } from 'next/navigation';
import '@/public/styles/characters.scss';

export default function Profile() {
  const searchParams = useSearchParams();
  const character = searchParams.get('character');

  return (
    <div id="profile">
      { character }
    </div>
  );
}
