"use client";
import { useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import '@/public/styles/signin.scss';
import { isAuthenticated } from '@/components/authentication';

export default function Signin() {
  const router = useRouter();

  useEffect(() => {
    isAuthenticated(router).then(isAuth => {
      if (isAuth) {
        router.push('/admin');
      }
    });
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    fetch('/api/users/signin', {
      method: 'POST',
      body: formData,
    }).then((res) => {
      if (res.ok) {
        return res.json();
      } else {
        throw new Error('로그인 실패');
      }
    }).then((data) => {
      if (data.success) {
        window.location.href = '/admin';
      } else {
        alert('로그인 정보가 올바르지 않습니다.');
      }
    }).catch((error) => {
      console.error('로그인 에러:', error);
      alert('로그인에 실패했습니다. 다시 시도해주세요.');
    });
  };

  return (
    <div id="main">
      <form onSubmit={handleSubmit}>
        <h2>관리자 로그인</h2>
        <div className="info"></div>
        <div className="inputs">
          <input type="text" id="username" name="username" placeholder="Username" required />
          <input type="password" id="password" name="password" placeholder="Password" required />
        </div>
        <button type="submit">들어가기</button>
      </form>
    </div>
  );
}
