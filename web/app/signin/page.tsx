"use client";
import { FormEvent } from 'react';

import '@/public/styles/signin.scss';

export default function Home() {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    console.log(formData);
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
