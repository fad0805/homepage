"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { isAuthenticated } from "@/components/authentication"

// import '@/public/styles/admin.scss';

export default function AdminHome() {
  const router = useRouter();
  useEffect(() => {
    isAuthenticated(router).then((isAuth) => {
      if (!isAuth) {
        router.push('/signin');
      }
    });
  }, []);
  
  return (
    <div id="main">
      admin main
    </div>
  );
}
