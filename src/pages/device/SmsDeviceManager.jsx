import React, { useState, useEffect } from "react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_SMS_DEVICE_ROUTE; // Uses Vite env variable

export default function SmsDeviceManager() {
  const [devices, setDevices] = useState([]);
  const [form, setForm] = useState({ userid: "", device_id: "", mobile_number: "" });
  const [editMode, setEditMode] = useState(false);

  // ✅ Fetch devices
  const fetchDevices = async () => {
    try {
      const res = await axios.get(`${API_BASE}/devices`);
      setDevices(res.data.devices);
    } catch (err) {
      console.error("Error fetching devices:", err);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  // ✅ Handle form changes
  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // ✅ Add device
  const handleAdd = async () => {
    try {
      await axios.post(`${API_BASE}/devices`, form);
      fetchDevices();
      setForm({ userid: "", device_id: "", mobile_number: "" });
    } catch (err) {
      console.error("Error adding device:", err);
    }
  };

  // ✅ Update device
  const handleUpdate = async () => {
    try {
      await axios.put(`${API_BASE}/devices/${form.userid}`, form);
      fetchDevices();
      setForm({ userid: "", device_id: "", mobile_number: "" });
      setEditMode(false);
    } catch (err) {
      console.error("Error updating device:", err);
    }
  };

  // ✅ Delete device
  const handleDelete = async (userid) => {
    try {
      await axios.delete(`${API_BASE}/devices/${userid}`);
      fetchDevices();
    } catch (err) {
      console.error("Error deleting device:", err);
    }
  };

  // ✅ Set form for edit
  const startEdit = (device) => {
    setForm(device);
    setEditMode(true);
  };

  return (
    <div style={{ fontFamily: "Arial, sans-serif", padding: "20px" }}>
      <h2 style={{ textAlign: "center", marginBottom: "20px" }}>📱 SMS Device Manager</h2>

      {/* Form */}
      <div
        style={{
          border: "1px solid #ccc",
          padding: "15px",
          borderRadius: "8px",
          marginBottom: "20px",
          maxWidth: "400px",
          margin: "auto",
        }}
      >
        <input
          type="text"
          name="userid"
          placeholder="User ID"
          value={form.userid}
          onChange={handleChange}
          style={{
            width: "100%",
            marginBottom: "10px",
            padding: "8px",
            borderRadius: "5px",
            border: "1px solid #aaa",
          }}
          disabled={editMode} // userid shouldn't change during edit
        />
        <input
          type="text"
          name="device_id"
          placeholder="Device ID"
          value={form.device_id}
          onChange={handleChange}
          style={{
            width: "100%",
            marginBottom: "10px",
            padding: "8px",
            borderRadius: "5px",
            border: "1px solid #aaa",
          }}
        />
        <input
          type="text"
          name="mobile_number"
          placeholder="Mobile Number"
          value={form.mobile_number}
          onChange={handleChange}
          style={{
            width: "100%",
            marginBottom: "10px",
            padding: "8px",
            borderRadius: "5px",
            border: "1px solid #aaa",
          }}
        />

        {editMode ? (
          <button
            onClick={handleUpdate}
            style={{
              backgroundColor: "#007BFF",
              color: "white",
              padding: "10px 15px",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
              width: "100%",
            }}
          >
            Update Device
          </button>
        ) : (
          <button
            onClick={handleAdd}
            style={{
              backgroundColor: "#28a745",
              color: "white",
              padding: "10px 15px",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
              width: "100%",
            }}
          >
            Add Device
          </button>
        )}
      </div>

      {/* Device List */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginTop: "20px",
        }}
      >
        <thead>
          <tr style={{ backgroundColor: "#f2f2f2" }}>
            <th style={{ border: "1px solid #ddd", padding: "10px" }}>User ID</th>
            <th style={{ border: "1px solid #ddd", padding: "10px" }}>Device ID</th>
            <th style={{ border: "1px solid #ddd", padding: "10px" }}>Mobile Number</th>
            <th style={{ border: "1px solid #ddd", padding: "10px" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((d) => (
            <tr key={d.userid}>
              <td style={{ border: "1px solid #ddd", padding: "8px" }}>{d.userid}</td>
              <td style={{ border: "1px solid #ddd", padding: "8px" }}>{d.device_id}</td>
              <td style={{ border: "1px solid #ddd", padding: "8px" }}>{d.mobile_number}</td>
              <td style={{ border: "1px solid #ddd", padding: "8px" }}>
                <button
                  onClick={() => startEdit(d)}
                  style={{
                    backgroundColor: "#ffc107",
                    color: "black",
                    padding: "5px 10px",
                    marginRight: "5px",
                    border: "none",
                    borderRadius: "5px",
                    cursor: "pointer",
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(d.userid)}
                  style={{
                    backgroundColor: "#dc3545",
                    color: "white",
                    padding: "5px 10px",
                    border: "none",
                    borderRadius: "5px",
                    cursor: "pointer",
                  }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}