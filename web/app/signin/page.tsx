"use client";

import '@/public/styles/signin.scss';

export default function Home() {
  return (
    <div id="main">
      <form action="/signin" method="post">
        <h2>관리자 로그인</h2>
        <div className="error"></div>
        <div className="success"></div>
        <div className="inputs">
          <input type="text" id="username" name="username" placeholder="Username" required />
          <input type="password" id="password" name="password" placeholder="Password" required />
        </div>
        <button type="submit">들어가기</button>
      </form>
    </div>
  );
}
