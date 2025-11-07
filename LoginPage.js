import React from "react";

export default function LoginPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        background: "#fafafa",
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      {/* Left Side: Login Form */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-end",
          paddingRight: "60px",
        }}
      >
        <div style={{ width: 350 }}>
          <h2
            style={{
              fontWeight: 700,
              fontSize: 28,
              marginBottom: 24,
              lineHeight: 1.2,
            }}
          >
            Welcome To School<br />
            Management System
          </h2>
          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                marginBottom: 4,
                fontWeight: 500,
              }}
            >
              User ID
            </label>
            <input
              type="text"
              placeholder="admin"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 6,
                border: "1px solid #e5e9f2",
                background: "#f5f8ff",
                fontSize: 15,
                marginBottom: 8,
                outline: "none",
              }}
            />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                marginBottom: 4,
                fontWeight: 500,
              }}
            >
              Password
            </label>
            <input
              type="password"
              placeholder="•••••"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 6,
                border: "1px solid #e5e9f2",
                background: "#f5f8ff",
                fontSize: 15,
                marginBottom: 8,
                outline: "none",
              }}
            />
          </div>
          <button
            style={{
              width: "100%",
              background: "#4f46e5",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "12px 0",
              fontWeight: 600,
              fontSize: 16,
              cursor: "pointer",
              marginBottom: 16,
              transition: "background 0.2s",
            }}
          >
            Log in
          </button>
          <div style={{ fontSize: 13, marginBottom: 18 }}>
            Don't have an account?{" "}
            <a href="#" style={{ color: "#4f46e5", textDecoration: "none" }}>
              Sign Up!
            </a>
          </div>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            <span style={{ color: "#e11d48", fontWeight: 700, marginRight: 6 }}>
              &#10067;
            </span>
            <span style={{ fontWeight: 600 }}>Can you change your plan?</span>
            <div style={{ color: "#555", fontWeight: 400, marginTop: 2 }}>
              Whenever you want. School Management System will also change with you according to your needs.
            </div>
          </div>
          <a
            href="#"
            style={{
              color: "#4f46e5",
              fontSize: 13,
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            Contact Us
          </a>
        </div>
      </div>
      {/* Right Side: Illustration */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          paddingLeft: "40px",
        }}
      >
        <img
          src="c:\Users\raima\Pictures\Screenshots\Screenshot (239).png"
          alt="School Illustration"
          style={{
            width: 500,
            maxWidth: "90%",
            height: "auto",
            borderRadius: 12,
            boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
            background: "#fff",
          }}
        />
      </div>
    </div>
  );
}
