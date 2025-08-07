import React, { useState, useEffect } from "react";

const API_BASE = "http://localhost:8090/api";

export default function App() {
  const [view, setView] = useState("dashboard"); // default to dashboard
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);

  const [signupForm, setSignupForm] = useState({ name: "", email: "", password: "" });
  const [signinForm, setSigninForm] = useState({ email: "", password: "" });
  const [listingForm, setListingForm] = useState({
    name: "",
    description: "",
    paymentPerDay: "",
    image: null,
    preview: null,
  });

  const [listings, setListings] = useState([]);
  const [dashboardListings, setDashboardListings] = useState([]);
  const [dashboardTab, setDashboardTab] = useState("all"); // "all" or "my"

  async function fetchListings() {
    setError("");
    try {
      const res = await fetch(API_BASE + "/");
      if (!res.ok) throw new Error("Failed to fetch listings");
      const text = await res.text();
      const lines = text.trim().split("\n");
      const arr = lines.map((line) => {
        const parts = line.split(", ").reduce((acc, cur) => {
          const [k, v] = cur.split(": ");
          acc[k.trim().toLowerCase()] = v.trim();
          return acc;
        }, {});
        return {
          id: parts.id,
          name: parts.name,
          description: parts.description,
          paymentPerDay: parts.payment,
          image: parts.image,
        };
      });
      setListings(arr);
    } catch (e) {
      console.error("Error fetching listings:", e);
      setError("Could not load listings.");
    }
  }

  async function fetchDashboardListings() {
    if (!user) return;
    setError("");
    try {
      const res = await fetch(API_BASE + `/dashboard/${user.id}`);
      if (!res.ok) throw new Error("Failed to fetch dashboard listings");
      const text = await res.text();
      const lines = text.trim().split("\n");
      const arr = lines.map((line) => {
        const parts = line.split(", ").reduce((acc, cur) => {
          const [k, v] = cur.split(": ");
          acc[k.trim().toLowerCase()] = v.trim();
          return acc;
        }, {});
        return {
          id: parts.id,
          name: parts.name,
          description: parts.desc || parts.description,
          paymentPerDay: parts.payment,
          image: parts.image,
        };
      });
      setDashboardListings(arr);
    } catch (e) {
      console.error("Error fetching dashboard listings:", e);
      setError("Could not load your listings.");
    }
  }

  async function handleSignup(e) {
    e.preventDefault();
    setError("");
    try {
      const body = new URLSearchParams();
      body.append("name", signupForm.name);
      body.append("email", signupForm.email);
      body.append("password", signupForm.password);

      const res = await fetch(API_BASE + "/signup", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Signup failed");
      }
      alert("Signup successful! Please login.");
      setView("signin");
      setSignupForm({ name: "", email: "", password: "" });
    } catch (e) {
      console.error("Signup error:", e);
      setError(e.message);
    }
  }

  async function handleSignin(e) {
    e.preventDefault();
    setError("");
    try {
      const body = new URLSearchParams();
      body.append("email", signinForm.email);
      body.append("password", signinForm.password);

      const res = await fetch(API_BASE + "/signin", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Signin failed");
      }
      const text = await res.text();
      const idMatch = text.match(/UserID:\s*(\d+)/);
      if (!idMatch) throw new Error("Invalid login response");
      const id = idMatch[1];
      setUser({ id, email: signinForm.email });
      setSigninForm({ email: "", password: "" });
      setView("dashboard");
      setDashboardTab("my");
      fetchDashboardListings();
    } catch (e) {
      console.error("Signin error:", e);
      setError(e.message);
    }
  }

  async function handleCreateListing(e) {
    e.preventDefault();
    setError("");
    if (!user) {
      setError("You must be logged in to create listing");
      return;
    }
    if (!listingForm.image) {
      setError("Please select an image");
      return;
    }
    try {
      const formData = new FormData();
      formData.append("user_id", user.id);
      formData.append("name", listingForm.name);
      formData.append("description", listingForm.description);
      formData.append("paymentPerDay", listingForm.paymentPerDay);
      formData.append("image", listingForm.image);

      const res = await fetch(API_BASE + "/create", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Create listing failed");
      }
      alert("Listing created!");
      setListingForm({ name: "", description: "", paymentPerDay: "", image: null, preview: null });
      setView("dashboard");
      setDashboardTab("my");
      fetchDashboardListings();
    } catch (e) {
      console.error("Create listing error:", e);
      setError(e.message);
    }
  }

  function handleSignout() {
    setUser(null);
    setView("dashboard");
    setDashboardTab("all");
    setListings([]);
    setDashboardListings([]);
  }

  useEffect(() => {
    if (view === "listings") fetchListings();
    if (view === "dashboard") {
      if (dashboardTab === "all") fetchListings();
      else if (dashboardTab === "my" && user) fetchDashboardListings();
    }
  }, [view, user, dashboardTab]);

  return (
    <div className="min-h-screen bg-white text-black flex flex-col items-center p-6 font-sans">
      <h1 className="text-4xl font-bold mb-6">RentX MVP</h1>

      {view === "dashboard" && (
        <>
          <div className="mb-6 flex items-center justify-between w-full max-w-3xl">
            <div className="flex space-x-4">
              <button
                className={`border border-black px-4 py-2 rounded font-semibold ${dashboardTab === "all" ? "bg-black text-white" : ""}`}
                onClick={() => setDashboardTab("all")}
              >
                All Listings
              </button>
              {user && (
                <button
                  className={`border border-black px-4 py-2 rounded font-semibold ${dashboardTab === "my" ? "bg-black text-white" : ""}`}
                  onClick={() => setDashboardTab("my")}
                >
                  My Listings
                </button>
              )}
            </div>

            <div>
              {!user ? (
                <>
                  <button
                    className="border border-black px-4 py-2 rounded mr-2 hover:bg-black hover:text-white"
                    onClick={() => setView("signin")}
                  >
                    Sign In
                  </button>
                  <button
                    className="border border-black px-4 py-2 rounded hover:bg-black hover:text-white"
                    onClick={() => setView("signup")}
                  >
                    Sign Up
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="border border-black px-4 py-2 rounded mr-2 hover:bg-black hover:text-white"
                    onClick={() => setView("create")}
                  >
                    Create Listing
                  </button>
                  <button
                    className="border border-black px-4 py-2 rounded hover:bg-black hover:text-white"
                    onClick={handleSignout}
                  >
                    Sign Out
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="w-full max-w-3xl space-y-4">
            {dashboardTab === "all" ? (
              listings.length === 0 ? (
                <p>No listings found.</p>
              ) : (
                <ul className="space-y-4">
                  {listings.map(({ id, name, description, paymentPerDay, image }) => (
                    <li key={id} className="border border-black rounded p-4 flex items-center space-x-4">
                      {image && (
                        <img
                          src={`${API_BASE}/${image}`}
                          alt={name}
                          className="w-24 h-24 object-cover rounded"
                          onError={(e) => (e.currentTarget.style.display = "none")}
                        />
                      )}
                      <div>
                        <h3 className="text-xl font-semibold">{name}</h3>
                        <p>{description}</p>
                        <p className="mt-1 font-bold">Payment/day: ৳{paymentPerDay}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            ) : user ? (
              dashboardListings.length === 0 ? (
                <p>You have no listings yet.</p>
              ) : (
                <ul className="space-y-4">
                  {dashboardListings.map(({ id, name, description, paymentPerDay, image }) => (
                    <li key={id} className="border border-black rounded p-4 flex items-center space-x-4">
                      {image && (
                        <img
                          src={`${API_BASE}/${image}`}
                          alt={name}
                          className="w-24 h-24 object-cover rounded"
                          onError={(e) => (e.currentTarget.style.display = "none")}
                        />
                      )}
                      <div>
                        <h3 className="text-xl font-semibold">{name}</h3>
                        <p>{description}</p>
                        <p className="mt-1 font-bold">Payment/day: ৳{paymentPerDay}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </div>
        </>
      )}

      {view === "signup" && (
        <form onSubmit={handleSignup} className="border border-black p-6 rounded w-full max-w-md space-y-4">
          <h2 className="text-2xl font-semibold mb-4">Sign Up</h2>
          <input
            required
            type="text"
            placeholder="Name"
            value={signupForm.name}
            onChange={(e) => setSignupForm({ ...signupForm, name: e.target.value })}
            className="w-full px-3 py-2 border border-black rounded"
          />
          <input
            required
            type="email"
            placeholder="Email"
            value={signupForm.email}
            onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })}
            className="w-full px-3 py-2 border border-black rounded"
          />
          <input
            required
            type="password"
            placeholder="Password"
            value={signupForm.password}
            onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })}
            className="w-full px-3 py-2 border border-black rounded"
          />
          <button
            type="submit"
            className="border border-black px-4 py-2 rounded font-semibold hover:bg-black hover:text-white transition"
          >
            Sign Up
          </button>
        </form>
      )}

      {view === "signin" && (
        <form onSubmit={handleSignin} className="border border-black p-6 rounded w-full max-w-md space-y-4">
          <h2 className="text-2xl font-semibold mb-4">Sign In</h2>
          <input
            required
            type="email"
            placeholder="Email"
            value={signinForm.email}
            onChange={(e) => setSigninForm({ ...signinForm, email: e.target.value })}
            className="w-full px-3 py-2 border border-black rounded"
          />
          <input
            required
            type="password"
            placeholder="Password"
            value={signinForm.password}
            onChange={(e) => setSigninForm({ ...signinForm, password: e.target.value })}
            className="w-full px-3 py-2 border border-black rounded"
          />
          <button
            type="submit"
            className="border border-black px-4 py-2 rounded font-semibold hover:bg-black hover:text-white transition"
          >
            Sign In
          </button>
        </form>
      )}

      {view === "create" && (
        <form onSubmit={handleCreateListing} className="border border-black p-6 rounded w-full max-w-md space-y-4">
          <h2 className="text-2xl font-semibold mb-4">Create Listing</h2>
          <input
            required
            type="text"
            placeholder="Name"
            value={listingForm.name}
            onChange={(e) => setListingForm({ ...listingForm, name: e.target.value })}
            className="w-full px-3 py-2 border border-black rounded"
          />
          <textarea
            required
            placeholder="Description"
            value={listingForm.description}
            onChange={(e) => setListingForm({ ...listingForm, description: e.target.value })}
            className="w-full px-3 py-2 border border-black rounded resize-none"
          />
          <input
            required
            type="number"
            placeholder="Payment Per Day (৳)"
            value={listingForm.paymentPerDay}
            onChange={(e) => setListingForm({ ...listingForm, paymentPerDay: e.target.value })}
            className="w-full px-3 py-2 border border-black rounded"
          />
          <input
            required
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files[0];
              if (file) {
                setListingForm((f) => ({ ...f, image: file, preview: URL.createObjectURL(file) }));
              }
            }}
            className="w-full text-black"
          />
          {listingForm.preview && (
            <img
              src={listingForm.preview}
              alt="Preview"
              className="w-32 h-32 object-cover rounded mt-2 border border-black"
            />
          )}
          <button
            type="submit"
            className="border border-black px-4 py-2 rounded font-semibold hover:bg-black hover:text-white transition"
          >
            Create Listing
          </button>
        </form>
      )}
    </div>
  );
}
