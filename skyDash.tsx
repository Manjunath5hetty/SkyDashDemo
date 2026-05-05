import { useState, useEffect, useRef, useCallback } from "react";

// ─── CONSTANTS & MOCK DATA ───────────────────────────────────────────────────
const ROLES = { CUSTOMER: "CUSTOMER", ADMIN: "ADMIN", DRONE: "DRONE" };
const ORDER_STATUS = ["CREATED","CONFIRMED","PREPARING","READY_FOR_DISPATCH","IN_FLIGHT","DELIVERED"];
const DRONE_STATUS = { IDLE: "IDLE", ASSIGNED: "ASSIGNED", IN_FLIGHT: "IN_FLIGHT", CHARGING: "CHARGING" };

const RESTAURANTS = [
  { id: 1, name: "Zen Kitchen", cuisine: "Japanese", lat: 12.972, lng: 77.594, rating: 4.8, deliveryTime: "18-25", img: "🍱" },
  { id: 2, name: "Burgerlab", cuisine: "American", lat: 12.968, lng: 77.601, rating: 4.6, deliveryTime: "12-20", img: "🍔" },
  { id: 3, name: "Spice Route", cuisine: "Indian", lat: 12.975, lng: 77.589, rating: 4.7, deliveryTime: "20-30", img: "🍛" },
  { id: 4, name: "Pasta Roma", cuisine: "Italian", lat: 12.963, lng: 77.598, rating: 4.5, deliveryTime: "15-22", img: "🍝" },
  { id: 5, name: "Sushi Nori", cuisine: "Japanese", lat: 12.970, lng: 77.605, rating: 4.9, deliveryTime: "20-28", img: "🍣" },
];

const MENU = {
  1: [{ id:101, name:"Dragon Roll", price:420, cal:320, img:"🥢" },{ id:102, name:"Miso Ramen", price:380, cal:480, img:"🍜" },{ id:103, name:"Edamame", price:180, cal:120, img:"🫛" }],
  2: [{ id:201, name:"Smash Burger", price:340, cal:650, img:"🍔" },{ id:202, name:"Truffle Fries", price:220, cal:380, img:"🍟" },{ id:203, name:"Milkshake", price:180, cal:420, img:"🥤" }],
  3: [{ id:301, name:"Butter Chicken", price:360, cal:520, img:"🍗" },{ id:302, name:"Garlic Naan", price:80, cal:160, img:"🫓" },{ id:303, name:"Dal Makhani", price:280, cal:440, img:"🫕" }],
  4: [{ id:401, name:"Carbonara", price:440, cal:680, img:"🍝" },{ id:402, name:"Bruschetta", price:200, cal:240, img:"🥖" },{ id:403, name:"Tiramisu", price:260, cal:380, img:"🍮" }],
  5: [{ id:501, name:"Omakase Set", price:980, cal:580, img:"🍱" },{ id:502, name:"Nigiri Platter", price:680, cal:420, img:"🍣" },{ id:503, name:"Mochi Ice Cream", price:240, cal:280, img:"🍡" }],
};

const INITIAL_DRONES = [
  { id:"DR-001", name:"Falcon-1", status: DRONE_STATUS.IDLE, battery:94, lat:12.971, lng:77.597, speed:0, altitude:0, load:0, totalDeliveries:42 },
  { id:"DR-002", name:"Hawk-2", status: DRONE_STATUS.IN_FLIGHT, battery:71, lat:12.969, lng:77.600, speed:48, altitude:120, load:1.2, totalDeliveries:87 },
  { id:"DR-003", name:"Eagle-3", status: DRONE_STATUS.CHARGING, battery:23, lat:12.974, lng:77.591, speed:0, altitude:0, load:0, totalDeliveries:61 },
  { id:"DR-004", name:"Raven-4", status: DRONE_STATUS.IDLE, battery:88, lat:12.966, lng:77.603, speed:0, altitude:0, load:0, totalDeliveries:29 },
  { id:"DR-005", name:"Storm-5", status: DRONE_STATUS.ASSIGNED, battery:56, lat:12.972, lng:77.595, speed:0, altitude:0, load:0.8, totalDeliveries:55 },
];

const NO_FLY_ZONES = [
  { id:"NFZ-1", name:"Airport Perimeter", lat:12.978, lng:77.598, radius:0.004, type:"RESTRICTED" },
  { id:"NFZ-2", name:"Govt. Complex", lat:12.961, lng:77.593, radius:0.003, type:"PROHIBITED" },
];

const TELEMETRY_LOG = [
  { time:"14:22:01", drone:"DR-002", event:"Waypoint reached", lat:12.969, lng:77.600 },
  { time:"14:21:44", drone:"DR-002", event:"Speed adjusted to 48 km/h", lat:null, lng:null },
  { time:"14:21:30", drone:"DR-001", event:"Dispatch initiated", lat:12.971, lng:77.597 },
  { time:"14:21:12", drone:"DR-003", event:"Battery critical - charging", lat:12.974, lng:77.591 },
  { time:"14:20:58", drone:"DR-005", event:"Assignment received", lat:12.972, lng:77.595 },
];

const WEATHER = { temp: 28, condition: "Clear", wind: 12, humidity: 65, safe: true, icon: "☀️" };

// Map bounds for our area
const MAP_BOUNDS = { minLat: 12.958, maxLat: 12.982, minLng: 77.583, maxLng: 77.612 };

// ─── MAP UTILITIES ────────────────────────────────────────────────────────────
function latLngToXY(lat, lng, width, height) {
  const x = ((lng - MAP_BOUNDS.minLng) / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng)) * width;
  const y = height - ((lat - MAP_BOUNDS.minLat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat)) * height;
  return { x, y };
}

// ─── MAP COMPONENT ────────────────────────────────────────────────────────────
function DroneMap({ drones, restaurants, noFlyZones, activeOrder, route, userLat, userLng, height = 320, showAllDrones = true }) {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;

    function draw(ts) {
      timeRef.current = ts;
      ctx.clearRect(0, 0, W, H);

      // Background grid - dark tactical map style
      ctx.fillStyle = "#0a0f1a";
      ctx.fillRect(0, 0, W, H);

      // Grid lines
      ctx.strokeStyle = "rgba(0,200,255,0.06)";
      ctx.lineWidth = 1;
      for (let i = 0; i < W; i += 40) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke();
      }
      for (let j = 0; j < H; j += 40) {
        ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(W, j); ctx.stroke();
      }

      // Subtle map topology blocks (fake city blocks)
      const blocks = [
        [0.15,0.2,0.12,0.08],[0.3,0.15,0.1,0.1],[0.5,0.25,0.08,0.12],
        [0.65,0.1,0.15,0.08],[0.2,0.45,0.12,0.1],[0.45,0.5,0.1,0.08],
        [0.7,0.4,0.12,0.12],[0.1,0.65,0.1,0.1],[0.55,0.65,0.15,0.08],
        [0.35,0.7,0.1,0.12],[0.78,0.65,0.12,0.1],[0.2,0.8,0.15,0.08],
      ];
      blocks.forEach(([rx,ry,rw,rh]) => {
        ctx.fillStyle = "rgba(20,40,70,0.6)";
        ctx.fillRect(rx*W, ry*H, rw*W, rh*H);
        ctx.strokeStyle = "rgba(0,150,200,0.12)";
        ctx.lineWidth = 1;
        ctx.strokeRect(rx*W, ry*H, rw*W, rh*H);
      });

      // No-fly zones
      if (noFlyZones) {
        noFlyZones.forEach(nfz => {
          const { x, y } = latLngToXY(nfz.lat, nfz.lng, W, H);
          const radiusX = (nfz.radius / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng)) * W;
          const radiusY = (nfz.radius / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat)) * H;
          const r = (radiusX + radiusY) / 2;

          // Pulsing fill
          const pulse = 0.3 + 0.1 * Math.sin(ts * 0.002);
          const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
          grad.addColorStop(0, `rgba(255,60,60,${pulse})`);
          grad.addColorStop(1, "rgba(255,60,60,0)");
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

          ctx.strokeStyle = nfz.type === "PROHIBITED" ? "#ff3c3c" : "#ff9500";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = nfz.type === "PROHIBITED" ? "#ff3c3c" : "#ff9500";
          ctx.font = "bold 9px monospace";
          ctx.textAlign = "center";
          ctx.fillText("⛔ " + nfz.name, x, y - r - 5);
        });
      }

      // Route path
      if (route?.waypoints && route.waypoints.length > 1) {
        const pts = route.waypoints.map(w => latLngToXY(w.lat, w.lng, W, H));

        // Glow
        ctx.shadowColor = "#00e5ff";
        ctx.shadowBlur = 8;
        ctx.strokeStyle = "rgba(0,229,255,0.25)";
        ctx.lineWidth = 6;
        ctx.beginPath();
        pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.stroke();

        // Core
        ctx.strokeStyle = "#00e5ff";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;

        // Animated dot along route
        const totalPts = pts.length - 1;
        const progress = ((ts * 0.0004) % 1);
        const segIdx = Math.floor(progress * totalPts);
        const segT = (progress * totalPts) % 1;
        if (segIdx < totalPts) {
          const a = pts[segIdx], b = pts[segIdx + 1];
          const px = a.x + (b.x - a.x) * segT;
          const py = a.y + (b.y - a.y) * segT;
          ctx.fillStyle = "#00e5ff";
          ctx.shadowColor = "#00e5ff";
          ctx.shadowBlur = 10;
          ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // Restaurants
      if (restaurants) {
        restaurants.forEach(r => {
          const { x, y } = latLngToXY(r.lat, r.lng, W, H);
          ctx.fillStyle = "#1a2a1a";
          ctx.strokeStyle = "#00ff88";
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
          ctx.font = "11px serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(r.img, x, y);

          ctx.fillStyle = "rgba(0,255,136,0.85)";
          ctx.font = "bold 8px monospace";
          ctx.textBaseline = "bottom";
          ctx.fillText(r.name, x, y - 13);
        });
      }

      // User location
      if (userLat && userLng) {
        const { x, y } = latLngToXY(userLat, userLng, W, H);
        const pulse = 8 + 4 * Math.sin(ts * 0.003);
        ctx.fillStyle = "rgba(0,120,255,0.15)";
        ctx.beginPath(); ctx.arc(x, y, pulse, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#4488ff";
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = "rgba(100,170,255,0.9)";
        ctx.font = "bold 8px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText("YOU", x, y - 8);
      }

      // Drones
      const visibleDrones = showAllDrones ? drones : drones.filter(d =>
        activeOrder && d.id === activeOrder.droneId
      );

      visibleDrones.forEach(drone => {
        const { x, y } = latLngToXY(drone.lat, drone.lng, W, H);
        const isFlying = drone.status === DRONE_STATUS.IN_FLIGHT;
        const isActive = activeOrder && drone.id === activeOrder.droneId;

        // Pulse ring for flying drones
        if (isFlying) {
          const ring = 14 + 6 * Math.abs(Math.sin(ts * 0.003 + x));
          ctx.strokeStyle = isActive ? "rgba(255,220,0,0.6)" : "rgba(0,229,255,0.4)";
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, ring, 0, Math.PI * 2); ctx.stroke();
        }

        // Shadow
        ctx.shadowColor = isActive ? "#ffdc00" : isFlying ? "#00e5ff" : "#888";
        ctx.shadowBlur = isActive ? 16 : isFlying ? 10 : 4;

        // Drone body
        const droneColor = isActive ? "#ffdc00" : isFlying ? "#00e5ff" :
          drone.status === DRONE_STATUS.CHARGING ? "#ff9500" :
          drone.status === DRONE_STATUS.ASSIGNED ? "#aa88ff" : "#aaa";

        ctx.fillStyle = droneColor;
        ctx.beginPath();
        // Diamond shape
        ctx.moveTo(x, y - 10);
        ctx.lineTo(x + 7, y);
        ctx.lineTo(x, y + 10);
        ctx.lineTo(x - 7, y);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        // Propeller dots (animated for flying drones)
        if (isFlying) {
          const propAngle = ts * 0.01;
          [[1,0],[0,1],[-1,0],[0,-1]].forEach(([px,py]) => {
            const propX = x + Math.cos(propAngle + Math.atan2(py, px)) * 9;
            const propY = y + Math.sin(propAngle + Math.atan2(py, px)) * 9;
            ctx.fillStyle = "rgba(255,255,255,0.5)";
            ctx.beginPath(); ctx.arc(propX, propY, 2, 0, Math.PI * 2); ctx.fill();
          });
        }

        // Drone label
        ctx.fillStyle = droneColor;
        ctx.font = "bold 8px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(drone.id, x, y + 12);
      });

      // Compass
      ctx.fillStyle = "rgba(0,229,255,0.7)";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText("N ↑", W - 10, 10);

      // Scale bar
      ctx.fillStyle = "rgba(0,229,255,0.4)";
      ctx.fillRect(10, H - 18, 60, 2);
      ctx.fillStyle = "rgba(0,229,255,0.6)";
      ctx.font = "8px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText("~500m", 10, H - 20);

      animFrameRef.current = requestAnimationFrame(draw);
    }

    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [drones, restaurants, noFlyZones, activeOrder, route, userLat, userLng, showAllDrones]);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={height}
      style={{ width: "100%", height: height, borderRadius: 12, display: "block" }}
    />
  );
}

// ─── MAP LEGEND ───────────────────────────────────────────────────────────────
function MapLegend() {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", padding: "8px 0", fontSize: 10, color: "#888" }}>
      {[
        ["#ffdc00", "Active Drone"],
        ["#00e5ff", "In Flight"],
        ["#aa88ff", "Assigned"],
        ["#ff9500", "Charging"],
        ["#aaa", "Idle"],
        ["#00ff88", "Restaurant"],
        ["#4488ff", "You"],
        ["#ff3c3c", "No-Fly Zone"],
      ].map(([color, label]) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
          <span style={{ fontFamily: "monospace", fontSize: 9, color: "#aaa" }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── A* ROUTE SIMULATION ──────────────────────────────────────────────────────
function generateAStarRoute(from, to) {
  const steps = 12;
  const waypoints = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const jitter = (Math.random() - 0.5) * 0.002;
    waypoints.push({
      lat: from.lat + (to.lat - from.lat) * t + (i > 0 && i < steps ? jitter : 0),
      lng: from.lng + (to.lng - from.lng) * t + (i > 0 && i < steps ? jitter : 0),
      altitude: i === 0 || i === steps ? 0 : 80 + Math.random() * 60,
      waypoint: i,
    });
  }
  const dist = Math.sqrt(Math.pow((to.lat-from.lat)*111,2)+Math.pow((to.lng-from.lng)*111,2));
  return { waypoints, distance: dist.toFixed(2), eta: Math.round(dist/0.8*60), score: (0.92 + Math.random()*0.07).toFixed(3) };
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("login");
  const [user, setUser] = useState(null);
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([
    { id:"ORD-8821", restaurantId:2, restaurantName:"Burgerlab", items:[{name:"Smash Burger",qty:2,price:340}], total:780, status:"IN_FLIGHT", droneId:"DR-002", createdAt:"14:10", eta:"14:28",
      route: generateAStarRoute({lat:12.968,lng:77.601},{lat:12.9655,lng:77.610}) },
    { id:"ORD-8820", restaurantId:1, restaurantName:"Zen Kitchen", items:[{name:"Dragon Roll",qty:1,price:420}], total:470, status:"DELIVERED", droneId:"DR-001", createdAt:"13:45", eta:"14:05" },
  ]);
  const [drones, setDrones] = useState(INITIAL_DRONES);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [routeData, setRouteData] = useState(null);
  const [adminTab, setAdminTab] = useState("overview");
  const [notification, setNotification] = useState(null);

  const USER_LAT = 12.9655;
  const USER_LNG = 77.6100;

  const notify = (msg, type="info") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3500);
  };

  useEffect(() => {
    const iv = setInterval(() => {
      setDrones(prev => prev.map(d => {
        if (d.status === DRONE_STATUS.IN_FLIGHT) {
          return { ...d,
            lat: d.lat + (Math.random()-0.5)*0.0004,
            lng: d.lng + (Math.random()-0.5)*0.0004,
            battery: Math.max(0, d.battery - 0.05),
            speed: 45 + Math.random()*10,
          };
        }
        if (d.status === DRONE_STATUS.CHARGING) {
          return { ...d, battery: Math.min(100, d.battery + 0.3) };
        }
        return d;
      }));
    }, 2000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!activeOrder) return;
    const statuses = ORDER_STATUS;
    const curIdx = statuses.indexOf(activeOrder.status);
    if (curIdx >= statuses.length - 1) return;
    const timeout = [3000,4000,5000,6000,8000][curIdx] || 5000;
    const t = setTimeout(() => {
      const next = statuses[curIdx + 1];
      setActiveOrder(o => ({ ...o, status: next }));
      setOrders(prev => prev.map(o => o.id === activeOrder.id ? { ...o, status: next } : o));
      if (next === "IN_FLIGHT") notify("🚁 Drone dispatched! Tracking live.", "success");
      if (next === "DELIVERED") notify("✓ Order delivered!", "success");
    }, timeout);
    return () => clearTimeout(t);
  }, [activeOrder?.status]);

  const login = (role) => {
    const names = { CUSTOMER: "Alex Chen", ADMIN: "Maya Patel", DRONE: "System" };
    setUser({ name: names[role], role, avatar: role[0] });
    setScreen(role === "ADMIN" ? "admin" : "home");
  };

  const placeOrder = () => {
    if (!cart.length || !selectedRestaurant) return;
    const total = cart.reduce((s,i) => s + i.price * i.qty, 0) + 49;
    const route = generateAStarRoute(
      { lat: selectedRestaurant.lat, lng: selectedRestaurant.lng },
      { lat: USER_LAT, lng: USER_LNG }
    );
    const idleDrones = drones.filter(d => d.status === DRONE_STATUS.IDLE && d.battery > 30);
    const assignedDrone = idleDrones.sort((a,b) => b.battery-a.battery)[0];
    const order = {
      id: `ORD-${8822 + orders.length}`,
      restaurantId: selectedRestaurant.id,
      restaurantName: selectedRestaurant.name,
      items: cart,
      total,
      status: "CREATED",
      droneId: assignedDrone?.id || "PENDING",
      createdAt: new Date().toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'}),
      eta: new Date(Date.now()+route.eta*60000).toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit'}),
      route,
    };
    if (assignedDrone) {
      setDrones(prev => prev.map(d => d.id===assignedDrone.id ? {...d, status:DRONE_STATUS.ASSIGNED} : d));
    }
    setOrders(prev => [order, ...prev]);
    setActiveOrder(order);
    setRouteData(route);
    setCart([]);
    setSelectedRestaurant(null);
    setScreen("tracking");
    notify("Order placed! AI routing in progress…", "success");
  };

  const addToCart = (item) => {
    setCart(prev => {
      const ex = prev.find(i => i.id === item.id);
      if (ex) return prev.map(i => i.id===item.id ? {...i, qty: i.qty+1} : i);
      return [...prev, { ...item, qty: 1 }];
    });
  };

  const removeFromCart = (itemId) => {
    setCart(prev => {
      const ex = prev.find(i => i.id === itemId);
      if (!ex) return prev;
      if (ex.qty === 1) return prev.filter(i => i.id !== itemId);
      return prev.map(i => i.id===itemId ? {...i, qty:i.qty-1} : i);
    });
  };

  const cartCount = cart.reduce((s,i) => s+i.qty, 0);

  return (
    <div style={S.app}>
      <style>{globalCSS}</style>
      {notification && <Notification {...notification} />}
      {screen === "login" && <LoginScreen onLogin={login} />}
      {screen === "home" && user?.role === "CUSTOMER" && (
        <CustomerHome
          user={user}
          restaurants={RESTAURANTS}
          orders={orders}
          cartCount={cartCount}
          drones={drones}
          userLat={USER_LAT}
          userLng={USER_LNG}
          onSelect={r => { setSelectedRestaurant(r); setScreen("menu"); }}
          onViewOrder={o => { setActiveOrder(o); setScreen("tracking"); }}
          onLogout={() => setScreen("login")}
        />
      )}
      {screen === "menu" && selectedRestaurant && (
        <MenuScreen
          restaurant={selectedRestaurant}
          menu={MENU[selectedRestaurant.id]}
          cart={cart}
          onAdd={addToCart}
          onRemove={removeFromCart}
          onBack={() => setScreen("home")}
          onCheckout={() => setScreen("checkout")}
        />
      )}
      {screen === "checkout" && selectedRestaurant && (
        <CheckoutScreen
          restaurant={selectedRestaurant}
          cart={cart}
          weather={WEATHER}
          drones={drones}
          onBack={() => setScreen("menu")}
          onPlace={placeOrder}
          onAdd={addToCart}
          onRemove={removeFromCart}
        />
      )}
      {screen === "tracking" && activeOrder && (
        <TrackingScreen
          order={activeOrder}
          drone={drones.find(d => d.id === activeOrder.droneId)}
          drones={drones}
          route={routeData || activeOrder.route}
          weather={WEATHER}
          userLat={USER_LAT}
          userLng={USER_LNG}
          onBack={() => setScreen("home")}
        />
      )}
      {screen === "admin" && (
        <AdminDashboard
          user={user}
          drones={drones}
          orders={orders}
          noFlyZones={NO_FLY_ZONES}
          telemetry={TELEMETRY_LOG}
          weather={WEATHER}
          tab={adminTab}
          setTab={setAdminTab}
          userLat={USER_LAT}
          userLng={USER_LNG}
          onLogout={() => setScreen("login")}
          onDroneCommand={(id, cmd) => {
            setDrones(prev => prev.map(d => {
              if (d.id !== id) return d;
              if (cmd === "RETURN") return { ...d, status: DRONE_STATUS.IDLE, speed: 0 };
              if (cmd === "CHARGE") return { ...d, status: DRONE_STATUS.CHARGING, speed: 0 };
              return d;
            }));
            notify(`Command ${cmd} sent to ${id}`, "info");
          }}
        />
      )}
    </div>
  );
}

// ─── NOTIFICATION ─────────────────────────────────────────────────────────────
function Notification({ msg, type }) {
  const colors = { success: "#00ff88", info: "#00e5ff", warn: "#ff9500", error: "#ff3c3c" };
  return (
    <div style={{
      position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
      background: "#0d1520", border: `1px solid ${colors[type]||colors.info}`,
      color: colors[type]||colors.info, padding: "10px 20px", borderRadius: 8,
      fontFamily: "monospace", fontSize: 13, zIndex: 9999,
      boxShadow: `0 0 20px ${colors[type]||colors.info}40`,
      animation: "slideDown 0.3s ease",
    }}>{msg}</div>
  );
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [tab, setTab] = useState("CUSTOMER");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = () => {
    if (!email) return;
    setLoading(true);
    setTimeout(() => { setLoading(false); onLogin(tab); }, 1200);
  };

  return (
    <div style={S.loginBg}>
      <div style={S.loginGlow} />
      <div style={S.loginCard}>
        <div style={S.loginLogo}>
          <span style={S.loginLogoIcon}>✦</span>
          <span style={S.loginLogoText}>SKYDASH</span>
        </div>
        <p style={S.loginSubtitle}>Autonomous Drone Delivery System</p>
        <div style={S.tabRow}>
          {["CUSTOMER","ADMIN"].map(r => (
            <button key={r} style={{...S.tabBtn, ...(tab===r?S.tabBtnActive:{})}} onClick={()=>setTab(r)}>
              {r === "CUSTOMER" ? "👤 Customer" : "⬡ Admin"}
            </button>
          ))}
        </div>
        <div style={S.inputGroup}>
          <label style={S.inputLabel}>EMAIL</label>
          <input style={S.input} value={email} onChange={e=>setEmail(e.target.value)}
            placeholder={tab==="CUSTOMER"?"user@example.com":"admin@skydash.io"}
            onKeyDown={e=>e.key==="Enter"&&submit()} />
        </div>
        <div style={S.inputGroup}>
          <label style={S.inputLabel}>PASSWORD</label>
          <input style={S.input} type="password" value={pass} onChange={e=>setPass(e.target.value)}
            placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&submit()} />
        </div>
        <button style={{...S.loginBtn, ...(loading?{opacity:0.6}:{})}} onClick={submit} disabled={loading}>
          {loading ? "AUTHENTICATING…" : `ENTER AS ${tab}`}
        </button>
        <p style={S.loginHint}>Demo: any email + any password</p>
        <div style={S.loginStats}>
          {[["12k+","Active Drones"],["98.7%","Success Rate"],["4.2min","Avg Delivery"]].map(([v,l]) => (
            <div key={l} style={S.loginStat}>
              <span style={S.loginStatVal}>{v}</span>
              <span style={S.loginStatLabel}>{l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── CUSTOMER HOME ─────────────────────────────────────────────────────────────
function CustomerHome({ user, restaurants, orders, cartCount, drones, userLat, userLng, onSelect, onViewOrder, onLogout }) {
  const [search, setSearch] = useState("");
  const [showMap, setShowMap] = useState(false);
  const activeOrders = orders.filter(o => o.status !== "DELIVERED");
  const filtered = restaurants.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.cuisine.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={S.page}>
      <div style={S.homeHeader}>
        <div>
          <p style={S.homeGreet}>Good afternoon,</p>
          <h2 style={S.homeName}>{user.name} <span>👋</span></h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={S.weatherPill}>☀️ 28°C</div>
          <button style={S.iconBtn} onClick={onLogout} title="Logout">⏻</button>
        </div>
      </div>

      {/* Area Map Toggle */}
      <div style={S.mapCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showMap ? 10 : 0 }}>
          <div>
            <p style={{ margin: 0, fontFamily: "monospace", fontSize: 11, color: "#00e5ff", letterSpacing: 2 }}>LIVE AREA MAP</p>
            <p style={{ margin: 0, fontSize: 11, color: "#666" }}>{drones.filter(d=>d.status===DRONE_STATUS.IN_FLIGHT).length} drones airborne nearby</p>
          </div>
          <button style={S.mapToggleBtn} onClick={() => setShowMap(v=>!v)}>
            {showMap ? "▲ HIDE" : "▼ SHOW"}
          </button>
        </div>
        {showMap && (
          <>
            <DroneMap
              drones={drones}
              restaurants={restaurants}
              noFlyZones={NO_FLY_ZONES}
              userLat={userLat}
              userLng={userLng}
              height={260}
              showAllDrones={true}
            />
            <MapLegend />
          </>
        )}
      </div>

      {activeOrders.length > 0 && (
        <div style={S.activeOrderBanner} onClick={() => onViewOrder(activeOrders[0])}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={S.pulsingDot} />
            <div>
              <p style={{ margin:0, fontFamily:"monospace", fontSize:12, color:"#00e5ff" }}>Live Order · {activeOrders[0].id}</p>
              <p style={{ margin:0, fontSize:11, color:"#aaa" }}>{activeOrders[0].restaurantName} · {activeOrders[0].status.replace(/_/g," ")}</p>
            </div>
          </div>
          <span style={{ color: "#00e5ff" }}>→</span>
        </div>
      )}

      <div style={S.searchWrap}>
        <span style={S.searchIcon}>⌕</span>
        <input style={S.searchInput} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search restaurants or cuisine…" />
      </div>

      <h3 style={S.sectionTitle}>RESTAURANTS NEARBY</h3>
      <div style={S.restaurantGrid}>
        {filtered.map(r => (
          <div key={r.id} style={S.restaurantCard} onClick={() => onSelect(r)} className="card-hover">
            <div style={S.restaurantEmoji}>{r.img}</div>
            <div style={{ padding: "10px 14px" }}>
              <h4 style={{ margin:"0 0 4px", fontSize:14, color:"#eee", fontFamily:"monospace" }}>{r.name}</h4>
              <p style={{ margin:"0 0 8px", fontSize:11, color:"#777" }}>{r.cuisine} · {r.deliveryTime} min</p>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <span style={S.ratingBadge}>★ {r.rating}</span>
                <span style={S.droneBadge}>🚁 Drone</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <h3 style={S.sectionTitle}>PAST ORDERS</h3>
      {orders.filter(o=>o.status==="DELIVERED").map(o => (
        <div key={o.id} style={S.orderCard}>
          <div>
            <p style={{ margin:"0 0 2px", fontFamily:"monospace", fontSize:12, color:"#00e5ff" }}>{o.id}</p>
            <p style={{ margin:"0 0 2px", fontSize:13, color:"#ddd" }}>{o.restaurantName}</p>
            <p style={{ margin:0, fontSize:11, color:"#666" }}>{o.items.map(i=>i.name).join(", ")}</p>
          </div>
          <div style={{ textAlign:"right" }}>
            <p style={{ margin:"0 0 6px", fontSize:16, fontFamily:"monospace", color:"#eee" }}>₹{o.total}</p>
            <span style={S.deliveredBadge}>Delivered</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── MENU SCREEN ───────────────────────────────────────────────────────────────
function MenuScreen({ restaurant, menu, cart, onAdd, onRemove, onBack, onCheckout }) {
  const cartCount = cart.reduce((s,i)=>s+i.qty,0);
  const cartTotal = cart.reduce((s,i)=>s+i.price*i.qty,0);

  return (
    <div style={S.page}>
      <div style={S.menuHeader}>
        <button style={S.backBtn} onClick={onBack}>←</button>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:28 }}>{restaurant.img}</span>
          <div>
            <h2 style={{ margin:0, fontFamily:"monospace", fontSize:18, color:"#eee" }}>{restaurant.name}</h2>
            <p style={{ margin:0, fontSize:11, color:"#777" }}>{restaurant.cuisine} · ★ {restaurant.rating}</p>
          </div>
        </div>
      </div>

      <div style={{ padding:"0 16px 100px" }}>
        {menu.map(item => {
          const inCart = cart.find(i=>i.id===item.id);
          return (
            <div key={item.id} style={S.menuItem} className="card-hover">
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <span style={{ fontSize:30 }}>{item.img}</span>
                <div>
                  <p style={{ margin:"0 0 2px", fontSize:14, color:"#eee", fontFamily:"monospace" }}>{item.name}</p>
                  <p style={{ margin:"0 0 2px", fontSize:11, color:"#555" }}>{item.cal} kcal</p>
                  <p style={{ margin:0, fontSize:15, color:"#00ff88", fontFamily:"monospace" }}>₹{item.price}</p>
                </div>
              </div>
              <div style={S.qtyControl}>
                {inCart ? (
                  <>
                    <button style={S.qtyBtn} onClick={()=>onRemove(item.id)}>−</button>
                    <span style={{ color:"#eee", fontFamily:"monospace", minWidth:16, textAlign:"center" }}>{inCart.qty}</span>
                    <button style={S.qtyBtn} onClick={()=>onAdd(item)}>+</button>
                  </>
                ) : (
                  <button style={S.addBtn} onClick={()=>onAdd(item)}>ADD +</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {cartCount > 0 && (
        <div style={S.cartBar} onClick={onCheckout}>
          <span style={{ background:"rgba(255,255,255,0.2)", borderRadius:12, padding:"2px 8px", fontFamily:"monospace", fontSize:12 }}>{cartCount}</span>
          <span style={{ fontFamily:"monospace", fontWeight:"bold" }}>View Cart & Checkout</span>
          <span style={{ fontFamily:"monospace", color:"rgba(0,0,0,0.8)" }}>₹{cartTotal}</span>
        </div>
      )}
    </div>
  );
}

// ─── CHECKOUT SCREEN ──────────────────────────────────────────────────────────
function CheckoutScreen({ restaurant, cart, weather, drones, onBack, onPlace, onAdd, onRemove }) {
  const subtotal = cart.reduce((s,i)=>s+i.price*i.qty,0);
  const idleDrones = drones.filter(d=>d.status===DRONE_STATUS.IDLE&&d.battery>30);
  const bestDrone = idleDrones.sort((a,b)=>b.battery-a.battery)[0];

  return (
    <div style={S.page}>
      <div style={S.menuHeader}>
        <button style={S.backBtn} onClick={onBack}>←</button>
        <h2 style={{ margin:0, fontFamily:"monospace", fontSize:18, color:"#eee" }}>CHECKOUT</h2>
      </div>
      <div style={{ padding:"0 16px 100px" }}>
        <div style={S.checkoutSection}>
          <h3 style={S.sectionTitle}>ORDER SUMMARY</h3>
          {cart.map(item => (
            <div key={item.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid #1a2030" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span>{item.img}</span>
                <span style={{ fontFamily:"monospace", fontSize:13, color:"#ddd" }}>{item.name}</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={S.qtyControl}>
                  <button style={S.qtyBtn} onClick={()=>onRemove(item.id)}>−</button>
                  <span style={{ color:"#eee", fontFamily:"monospace", minWidth:16, textAlign:"center", fontSize:13 }}>{item.qty}</span>
                  <button style={S.qtyBtn} onClick={()=>onAdd(item)}>+</button>
                </div>
                <span style={{ fontFamily:"monospace", color:"#00ff88", fontSize:13, minWidth:60, textAlign:"right" }}>₹{item.price*item.qty}</span>
              </div>
            </div>
          ))}
          <div style={{ paddingTop:10, display:"flex", flexDirection:"column", gap:6 }}>
            {[["Subtotal", `₹${subtotal}`], ["Delivery Fee", "₹49"], ["Total", `₹${subtotal+49}`]].map(([l,v], i) => (
              <div key={l} style={{ display:"flex", justifyContent:"space-between" }}>
                <span style={{ fontFamily:"monospace", fontSize: i===2?14:12, color: i===2?"#eee":"#777" }}>{l}</span>
                <span style={{ fontFamily:"monospace", fontSize: i===2?14:12, color: i===2?"#00ff88":"#777" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={S.checkoutSection}>
          <h3 style={S.sectionTitle}>DRONE ASSIGNMENT</h3>
          {bestDrone ? (
            <div style={{ background:"#0d1a0d", border:"1px solid #1a3a1a", borderRadius:10, padding:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <p style={{ margin:"0 0 4px", fontFamily:"monospace", fontSize:13, color:"#00ff88" }}>{bestDrone.id} — {bestDrone.name}</p>
                  <p style={{ margin:0, fontSize:11, color:"#666" }}>Battery: {Math.round(bestDrone.battery)}% · {bestDrone.totalDeliveries} deliveries</p>
                </div>
                <span style={{ fontSize:22 }}>✦</span>
              </div>
            </div>
          ) : (
            <p style={{ fontFamily:"monospace", fontSize:12, color:"#ff3c3c" }}>⚠ No drones available — order will be queued</p>
          )}
        </div>

        <div style={S.checkoutSection}>
          <h3 style={S.sectionTitle}>WEATHER</h3>
          <div style={{ display:"flex", gap:16, alignItems:"center" }}>
            <span style={{ fontSize:28 }}>{weather.icon}</span>
            <div>
              <p style={{ margin:"0 0 2px", fontFamily:"monospace", fontSize:13, color:"#00ff88" }}>✓ Safe to fly</p>
              <p style={{ margin:0, fontSize:11, color:"#777" }}>{weather.temp}°C · Wind {weather.wind}km/h · Humidity {weather.humidity}%</p>
            </div>
          </div>
        </div>

        <button style={S.placeOrderBtn} onClick={onPlace}>
          PLACE ORDER — ₹{subtotal+49}
        </button>
      </div>
    </div>
  );
}

// ─── TRACKING SCREEN ──────────────────────────────────────────────────────────
function TrackingScreen({ order, drone, drones, route, weather, userLat, userLng, onBack }) {
  const steps = ORDER_STATUS;
  const curIdx = steps.indexOf(order.status);
  const restaurant = RESTAURANTS.find(r => r.id === order.restaurantId);

  return (
    <div style={S.page}>
      <div style={S.menuHeader}>
        <button style={S.backBtn} onClick={onBack}>←</button>
        <div>
          <h2 style={{ margin:0, fontFamily:"monospace", fontSize:16, color:"#eee" }}>{order.id}</h2>
          <p style={{ margin:0, fontSize:11, color:"#777" }}>{order.restaurantName}</p>
        </div>
        {order.status !== "DELIVERED" && (
          <div style={{ marginLeft:"auto", textAlign:"right" }}>
            <p style={{ margin:0, fontFamily:"monospace", fontSize:11, color:"#00e5ff" }}>ETA</p>
            <p style={{ margin:0, fontFamily:"monospace", fontSize:15, color:"#eee" }}>{order.eta}</p>
          </div>
        )}
      </div>

      {/* Live Map */}
      <div style={{ margin:"0 16px 16px", borderRadius:12, overflow:"hidden", border:"1px solid #1a2a40" }}>
        <div style={{ background:"#060e1a", padding:"8px 12px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontFamily:"monospace", fontSize:10, color:"#00e5ff", letterSpacing:2 }}>
            LIVE TRACKING MAP
          </span>
          {drone && (
            <span style={{ fontFamily:"monospace", fontSize:10, color: drone.status===DRONE_STATUS.IN_FLIGHT?"#ffdc00":"#aaa" }}>
              {drone.id} · {drone.status.replace(/_/g," ")} · {Math.round(drone.battery)}%🔋
            </span>
          )}
        </div>
        <DroneMap
          drones={drones}
          restaurants={restaurant ? [restaurant] : []}
          noFlyZones={NO_FLY_ZONES}
          activeOrder={order}
          route={route}
          userLat={userLat}
          userLng={userLng}
          height={300}
          showAllDrones={false}
        />
        <div style={{ background:"#060e1a", padding:"6px 12px" }}>
          <MapLegend />
        </div>
      </div>

      {/* Status timeline */}
      <div style={{ margin:"0 16px 16px", background:"#0a1020", border:"1px solid #1a2030", borderRadius:12, padding:16 }}>
        <h3 style={S.sectionTitle}>STATUS</h3>
        <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
          {steps.map((step, i) => {
            const done = i < curIdx;
            const active = i === curIdx;
            return (
              <div key={step} style={{ display:"flex", alignItems:"flex-start", gap:12, paddingBottom: i < steps.length-1 ? 16 : 0 }}>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
                  <div style={{
                    width:20, height:20, borderRadius:"50%", flexShrink:0,
                    background: done ? "#00ff88" : active ? "#00e5ff" : "#1a2030",
                    border: active ? "2px solid #00e5ff" : "none",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:10, color: done||active?"#000":"#333",
                    boxShadow: active ? "0 0 10px #00e5ff60" : "none",
                  }}>{done?"✓":active?"●":""}</div>
                  {i < steps.length-1 && <div style={{ width:1, flex:1, background: done?"#00ff88":"#1a2030", minHeight:12 }} />}
                </div>
                <p style={{ margin:"2px 0 0", fontFamily:"monospace", fontSize:12,
                  color: active?"#00e5ff": done?"#00ff88":"#444" }}>
                  {step.replace(/_/g," ")}
                  {active && <span style={{ animation:"blink 1s infinite", marginLeft:6 }}>◌</span>}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Drone telemetry */}
      {drone && order.status === "IN_FLIGHT" && (
        <div style={{ margin:"0 16px 16px", background:"#0a1020", border:"1px solid #1a2030", borderRadius:12, padding:16 }}>
          <h3 style={S.sectionTitle}>DRONE TELEMETRY</h3>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {[
              ["DRONE", drone.id],
              ["BATTERY", `${Math.round(drone.battery)}%`],
              ["SPEED", `${Math.round(drone.speed)} km/h`],
              ["ALTITUDE", `${drone.altitude}m`],
            ].map(([l,v]) => (
              <div key={l} style={{ background:"#060e1a", borderRadius:8, padding:"10px 12px" }}>
                <p style={{ margin:"0 0 2px", fontSize:9, color:"#555", fontFamily:"monospace", letterSpacing:2 }}>{l}</p>
                <p style={{ margin:0, fontSize:16, fontFamily:"monospace", color:"#00e5ff" }}>{v}</p>
              </div>
            ))}
          </div>
          {route && (
            <div style={{ marginTop:10, display:"flex", gap:10 }}>
              <div style={{ flex:1, background:"#060e1a", borderRadius:8, padding:"8px 12px" }}>
                <p style={{ margin:"0 0 2px", fontSize:9, color:"#555", fontFamily:"monospace", letterSpacing:2 }}>DISTANCE</p>
                <p style={{ margin:0, fontSize:14, fontFamily:"monospace", color:"#aa88ff" }}>{route.distance} km</p>
              </div>
              <div style={{ flex:1, background:"#060e1a", borderRadius:8, padding:"8px 12px" }}>
                <p style={{ margin:"0 0 2px", fontSize:9, color:"#555", fontFamily:"monospace", letterSpacing:2 }}>ROUTE SCORE</p>
                <p style={{ margin:0, fontSize:14, fontFamily:"monospace", color:"#aa88ff" }}>{route.score}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {order.status === "DELIVERED" && (
        <div style={{ margin:"0 16px 16px", background:"#0d1a0d", border:"1px solid #1a3a1a", borderRadius:12, padding:20, textAlign:"center" }}>
          <div style={{ fontSize:40, marginBottom:8 }}>🎉</div>
          <p style={{ fontFamily:"monospace", fontSize:16, color:"#00ff88", margin:"0 0 4px" }}>ORDER DELIVERED!</p>
          <p style={{ fontSize:12, color:"#666", margin:0 }}>Total: ₹{order.total}</p>
        </div>
      )}
    </div>
  );
}

// ─── ADMIN DASHBOARD ──────────────────────────────────────────────────────────
function AdminDashboard({ user, drones, orders, noFlyZones, telemetry, weather, tab, setTab, userLat, userLng, onLogout, onDroneCommand }) {
  const statusColor = { IDLE:"#aaa", ASSIGNED:"#aa88ff", IN_FLIGHT:"#00e5ff", CHARGING:"#ff9500" };

  return (
    <div style={S.page}>
      <div style={S.adminHeader}>
        <div>
          <p style={{ margin:0, fontSize:9, fontFamily:"monospace", color:"#555", letterSpacing:3 }}>SKYDASH CONTROL</p>
          <h2 style={{ margin:0, fontFamily:"monospace", fontSize:16, color:"#eee" }}>{user.name}</h2>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <div style={S.weatherPill}>☀️ {weather.temp}°C · {weather.wind}km/h</div>
          <button style={S.iconBtn} onClick={onLogout}>⏻</button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={S.adminTabs}>
        {["overview","map","drones","orders","telemetry"].map(t => (
          <button key={t} style={{...S.adminTab, ...(tab===t?S.adminTabActive:{})}} onClick={()=>setTab(t)}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      <div style={{ flex:1, overflowY:"auto" }}>
        {tab === "overview" && (
          <div style={{ padding:16 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
              {[
                ["ACTIVE DRONES", drones.filter(d=>d.status===DRONE_STATUS.IN_FLIGHT).length, "#00e5ff"],
                ["LIVE ORDERS", orders.filter(o=>o.status!=="DELIVERED").length, "#ffdc00"],
                ["CHARGING", drones.filter(d=>d.status===DRONE_STATUS.CHARGING).length, "#ff9500"],
                ["DELIVERED TODAY", orders.filter(o=>o.status==="DELIVERED").length, "#00ff88"],
              ].map(([l,v,c]) => (
                <div key={l} style={{ background:"#0a1020", border:`1px solid ${c}30`, borderRadius:10, padding:"14px 16px" }}>
                  <p style={{ margin:"0 0 4px", fontSize:9, fontFamily:"monospace", color:"#555", letterSpacing:2 }}>{l}</p>
                  <p style={{ margin:0, fontSize:28, fontFamily:"monospace", color:c }}>{v}</p>
                </div>
              ))}
            </div>

            {/* Mini map in overview */}
            <div style={{ background:"#0a1020", border:"1px solid #1a2030", borderRadius:12, overflow:"hidden", marginBottom:16 }}>
              <div style={{ padding:"8px 14px", display:"flex", justifyContent:"space-between" }}>
                <span style={{ fontFamily:"monospace", fontSize:10, color:"#00e5ff", letterSpacing:2 }}>FLEET OVERVIEW</span>
                <span style={{ fontFamily:"monospace", fontSize:10, color:"#555" }}>{drones.length} DRONES</span>
              </div>
              <DroneMap
                drones={drones}
                restaurants={RESTAURANTS}
                noFlyZones={noFlyZones}
                userLat={userLat}
                userLng={userLng}
                height={220}
                showAllDrones={true}
              />
              <div style={{ padding:"6px 14px", background:"#060e1a" }}>
                <MapLegend />
              </div>
            </div>

            <div style={{ background:"#0a1020", border:"1px solid #1a2030", borderRadius:10, padding:14 }}>
              <p style={{ margin:"0 0 10px", fontFamily:"monospace", fontSize:10, color:"#555", letterSpacing:2 }}>FLEET STATUS</p>
              {drones.map(d => (
                <div key={d.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid #1a2030" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:statusColor[d.status] }} />
                    <span style={{ fontFamily:"monospace", fontSize:12, color:"#ddd" }}>{d.id}</span>
                  </div>
                  <span style={{ fontFamily:"monospace", fontSize:10, color:statusColor[d.status] }}>{d.status}</span>
                  <span style={{ fontFamily:"monospace", fontSize:11, color: d.battery<30?"#ff3c3c":d.battery<60?"#ff9500":"#00ff88" }}>{Math.round(d.battery)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "map" && (
          <div style={{ padding:16 }}>
            <div style={{ background:"#0a1020", border:"1px solid #1a2030", borderRadius:12, overflow:"hidden", marginBottom:12 }}>
              <div style={{ padding:"8px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontFamily:"monospace", fontSize:10, color:"#00e5ff", letterSpacing:2 }}>FULL AIRSPACE MAP</span>
                <span style={{ fontFamily:"monospace", fontSize:9, color:"#555" }}>
                  {noFlyZones.length} NFZ · {drones.filter(d=>d.status===DRONE_STATUS.IN_FLIGHT).length} AIRBORNE
                </span>
              </div>
              <DroneMap
                drones={drones}
                restaurants={RESTAURANTS}
                noFlyZones={noFlyZones}
                userLat={userLat}
                userLng={userLng}
                height={400}
                showAllDrones={true}
              />
              <div style={{ padding:"8px 14px", background:"#060e1a" }}>
                <MapLegend />
              </div>
            </div>

            <div style={{ background:"#0a1020", border:"1px solid #1a2030", borderRadius:10, padding:14 }}>
              <p style={{ margin:"0 0 10px", fontFamily:"monospace", fontSize:10, color:"#555", letterSpacing:2 }}>NO-FLY ZONES</p>
              {noFlyZones.map(nfz => (
                <div key={nfz.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid #1a2030" }}>
                  <div>
                    <p style={{ margin:"0 0 2px", fontFamily:"monospace", fontSize:12, color:nfz.type==="PROHIBITED"?"#ff3c3c":"#ff9500" }}>{nfz.name}</p>
                    <p style={{ margin:0, fontSize:10, color:"#555" }}>{nfz.lat.toFixed(3)}, {nfz.lng.toFixed(3)} · r={nfz.radius}</p>
                  </div>
                  <span style={{ fontFamily:"monospace", fontSize:10, background: nfz.type==="PROHIBITED"?"#ff3c3c20":"#ff950020",
                    color:nfz.type==="PROHIBITED"?"#ff3c3c":"#ff9500", padding:"3px 8px", borderRadius:4 }}>{nfz.type}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "drones" && (
          <div style={{ padding:16 }}>
            {drones.map(d => (
              <div key={d.id} style={{ background:"#0a1020", border:"1px solid #1a2030", borderRadius:12, padding:14, marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:10, height:10, borderRadius:"50%", background:statusColor[d.status],
                      boxShadow: d.status===DRONE_STATUS.IN_FLIGHT?`0 0 8px ${statusColor[d.status]}`:"none" }} />
                    <span style={{ fontFamily:"monospace", fontSize:14, color:"#eee" }}>{d.id}</span>
                    <span style={{ fontSize:11, color:"#666" }}>{d.name}</span>
                  </div>
                  <span style={{ fontFamily:"monospace", fontSize:10, color:statusColor[d.status] }}>{d.status}</span>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:10 }}>
                  {[
                    ["BATTERY", `${Math.round(d.battery)}%`, d.battery<30?"#ff3c3c":d.battery<60?"#ff9500":"#00ff88"],
                    ["SPEED", `${d.speed?Math.round(d.speed):0} km/h`, "#00e5ff"],
                    ["DELIVERIES", d.totalDeliveries, "#aa88ff"],
                  ].map(([l,v,c]) => (
                    <div key={l} style={{ background:"#060e1a", borderRadius:6, padding:"8px 10px" }}>
                      <p style={{ margin:"0 0 2px", fontSize:8, fontFamily:"monospace", color:"#555", letterSpacing:2 }}>{l}</p>
                      <p style={{ margin:0, fontSize:14, fontFamily:"monospace", color:c }}>{v}</p>
                    </div>
                  ))}
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button style={S.cmdBtn} onClick={()=>onDroneCommand(d.id,"RETURN")}>↩ RETURN</button>
                  <button style={{...S.cmdBtn, borderColor:"#ff9500", color:"#ff9500"}} onClick={()=>onDroneCommand(d.id,"CHARGE")}>⚡ CHARGE</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "orders" && (
          <div style={{ padding:16 }}>
            {orders.map(o => (
              <div key={o.id} style={{ background:"#0a1020", border:"1px solid #1a2030", borderRadius:10, padding:14, marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                  <span style={{ fontFamily:"monospace", fontSize:12, color:"#00e5ff" }}>{o.id}</span>
                  <span style={{ fontFamily:"monospace", fontSize:10, color:
                    o.status==="DELIVERED"?"#00ff88":o.status==="IN_FLIGHT"?"#00e5ff":"#aa88ff" }}>{o.status.replace(/_/g," ")}</span>
                </div>
                <p style={{ margin:"0 0 4px", fontSize:13, color:"#ddd" }}>{o.restaurantName}</p>
                <p style={{ margin:"0 0 6px", fontSize:11, color:"#666" }}>{o.items.map(i=>`${i.qty}×${i.name}`).join(", ")}</p>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ fontFamily:"monospace", fontSize:11, color:"#555" }}>Drone: {o.droneId}</span>
                  <span style={{ fontFamily:"monospace", fontSize:12, color:"#00ff88" }}>₹{o.total}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "telemetry" && (
          <div style={{ padding:16 }}>
            <div style={{ background:"#0a1020", border:"1px solid #1a2030", borderRadius:10, overflow:"hidden" }}>
              <div style={{ padding:"10px 14px", borderBottom:"1px solid #1a2030" }}>
                <span style={{ fontFamily:"monospace", fontSize:10, color:"#00e5ff", letterSpacing:2 }}>TELEMETRY LOG</span>
              </div>
              {telemetry.map((entry, i) => (
                <div key={i} style={{ padding:"10px 14px", borderBottom:"1px solid #0d1520", display:"flex", gap:12, alignItems:"flex-start" }}>
                  <span style={{ fontFamily:"monospace", fontSize:10, color:"#555", flexShrink:0 }}>{entry.time}</span>
                  <div>
                    <span style={{ fontFamily:"monospace", fontSize:10, color:"#00e5ff", marginRight:8 }}>{entry.drone}</span>
                    <span style={{ fontSize:12, color:"#aaa" }}>{entry.event}</span>
                    {entry.lat && <p style={{ margin:"2px 0 0", fontSize:9, fontFamily:"monospace", color:"#444" }}>{entry.lat.toFixed(4)}, {entry.lng.toFixed(4)}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = {
  app: { maxWidth: 430, margin: "0 auto", minHeight: "100vh", background: "#060e1a", color: "#eee", position: "relative", overflow: "hidden" },
  page: { display: "flex", flexDirection: "column", minHeight: "100vh", paddingBottom: 20 },

  loginBg: { minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#060e1a", position:"relative", overflow:"hidden" },
  loginGlow: { position:"absolute", top:"20%", left:"50%", transform:"translateX(-50%)", width:300, height:300, borderRadius:"50%", background:"radial-gradient(circle, rgba(0,229,255,0.08), transparent 70%)", pointerEvents:"none" },
  loginCard: { background:"#0a1020", border:"1px solid #1a2a40", borderRadius:20, padding:32, width:"calc(100% - 48px)", maxWidth:360, position:"relative", zIndex:1 },
  loginLogo: { display:"flex", alignItems:"center", gap:10, marginBottom:6 },
  loginLogoIcon: { fontSize:28, color:"#00e5ff" },
  loginLogoText: { fontFamily:"monospace", fontSize:24, fontWeight:"bold", letterSpacing:6, color:"#eee" },
  loginSubtitle: { fontFamily:"monospace", fontSize:11, color:"#555", letterSpacing:2, margin:"0 0 24px" },
  tabRow: { display:"flex", gap:8, marginBottom:20 },
  tabBtn: { flex:1, padding:"10px", background:"#060e1a", border:"1px solid #1a2a40", borderRadius:8, color:"#777", fontFamily:"monospace", fontSize:11, cursor:"pointer", letterSpacing:1 },
  tabBtnActive: { background:"#0d1a2a", border:"1px solid #00e5ff", color:"#00e5ff" },
  inputGroup: { marginBottom:16 },
  inputLabel: { display:"block", fontFamily:"monospace", fontSize:9, color:"#555", letterSpacing:3, marginBottom:6 },
  input: { width:"100%", background:"#060e1a", border:"1px solid #1a2a40", borderRadius:8, padding:"12px 14px", color:"#eee", fontFamily:"monospace", fontSize:13, outline:"none", boxSizing:"border-box" },
  loginBtn: { width:"100%", padding:"14px", background:"#00e5ff", border:"none", borderRadius:10, color:"#060e1a", fontFamily:"monospace", fontSize:13, fontWeight:"bold", letterSpacing:2, cursor:"pointer", marginTop:4 },
  loginHint: { fontFamily:"monospace", fontSize:10, color:"#444", textAlign:"center", margin:"12px 0 20px" },
  loginStats: { display:"flex", gap:0, borderTop:"1px solid #1a2a40", paddingTop:16 },
  loginStat: { flex:1, textAlign:"center" },
  loginStatVal: { display:"block", fontFamily:"monospace", fontSize:16, color:"#00e5ff" },
  loginStatLabel: { display:"block", fontFamily:"monospace", fontSize:9, color:"#555", letterSpacing:1 },

  homeHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"20px 16px 16px" },
  homeGreet: { margin:"0 0 2px", fontFamily:"monospace", fontSize:11, color:"#555", letterSpacing:2 },
  homeName: { margin:0, fontFamily:"monospace", fontSize:20, color:"#eee" },
  weatherPill: { background:"#0d1520", border:"1px solid #1a2a40", borderRadius:20, padding:"6px 12px", fontFamily:"monospace", fontSize:11, color:"#aaa" },
  iconBtn: { background:"none", border:"1px solid #1a2a40", borderRadius:8, padding:"8px 10px", color:"#777", cursor:"pointer", fontFamily:"monospace", fontSize:14 },

  mapCard: { margin:"0 16px 16px", background:"#0a1020", border:"1px solid #1a2a40", borderRadius:12, padding:14 },
  mapToggleBtn: { background:"none", border:"1px solid #1a2a40", borderRadius:6, padding:"6px 10px", color:"#00e5ff", fontFamily:"monospace", fontSize:10, cursor:"pointer", letterSpacing:1 },

  activeOrderBanner: { margin:"0 16px 16px", background:"#0a1a2a", border:"1px solid #1a3a5a", borderRadius:12, padding:"14px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer" },
  pulsingDot: { display:"inline-block", width:10, height:10, borderRadius:"50%", background:"#00e5ff", boxShadow:"0 0 0 3px rgba(0,229,255,0.2)", animation:"pulse 1.5s infinite" },

  searchWrap: { margin:"0 16px 16px", position:"relative" },
  searchIcon: { position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"#555", fontSize:16 },
  searchInput: { width:"100%", background:"#0a1020", border:"1px solid #1a2a40", borderRadius:10, padding:"12px 12px 12px 36px", color:"#eee", fontFamily:"monospace", fontSize:13, outline:"none", boxSizing:"border-box" },

  sectionTitle: { margin:"0 16px 12px", fontFamily:"monospace", fontSize:10, color:"#555", letterSpacing:3 },

  restaurantGrid: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, padding:"0 16px 16px" },
  restaurantCard: { background:"#0a1020", border:"1px solid #1a2030", borderRadius:12, overflow:"hidden", cursor:"pointer" },
  restaurantEmoji: { fontSize:40, padding:"16px", textAlign:"center", background:"#060e1a" },
  ratingBadge: { background:"#1a2a10", border:"1px solid #2a4a10", borderRadius:20, padding:"3px 8px", fontFamily:"monospace", fontSize:10, color:"#88cc44" },
  droneBadge: { fontFamily:"monospace", fontSize:9, color:"#555" },

  orderCard: { margin:"0 16px 10px", background:"#0a1020", border:"1px solid #1a2030", borderRadius:10, padding:14, display:"flex", justifyContent:"space-between", alignItems:"center" },
  deliveredBadge: { background:"#0d1a0d", border:"1px solid #1a3a1a", borderRadius:20, padding:"3px 8px", fontFamily:"monospace", fontSize:9, color:"#00ff88" },

  menuHeader: { display:"flex", alignItems:"center", gap:12, padding:"16px", borderBottom:"1px solid #1a2030" },
  backBtn: { background:"none", border:"1px solid #1a2a40", borderRadius:8, padding:"8px 12px", color:"#00e5ff", cursor:"pointer", fontFamily:"monospace", fontSize:16 },
  menuItem: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 0", borderBottom:"1px solid #1a2030" },
  qtyControl: { display:"flex", alignItems:"center", gap:8 },
  qtyBtn: { background:"#1a2a40", border:"1px solid #2a3a50", borderRadius:6, width:28, height:28, color:"#eee", cursor:"pointer", fontFamily:"monospace", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" },
  addBtn: { background:"transparent", border:"1px solid #00e5ff", borderRadius:6, padding:"6px 12px", color:"#00e5ff", cursor:"pointer", fontFamily:"monospace", fontSize:11, letterSpacing:1 },
  cartBar: { position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"calc(100% - 32px)", maxWidth:398, background:"#00e5ff", borderRadius:"12px 12px 0 0", padding:"16px", display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer", color:"#060e1a", fontFamily:"monospace", fontSize:13 },

  checkoutSection: { background:"#0a1020", border:"1px solid #1a2030", borderRadius:12, padding:16, margin:"0 16px 12px" },
  placeOrderBtn: { width:"calc(100% - 32px)", margin:"0 16px", padding:"16px", background:"#00ff88", border:"none", borderRadius:12, color:"#060e1a", fontFamily:"monospace", fontSize:14, fontWeight:"bold", letterSpacing:2, cursor:"pointer" },

  adminHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px", borderBottom:"1px solid #1a2030" },
  adminTabs: { display:"flex", overflowX:"auto", borderBottom:"1px solid #1a2030", scrollbarWidth:"none" },
  adminTab: { padding:"12px 14px", background:"none", border:"none", borderBottom:"2px solid transparent", color:"#555", fontFamily:"monospace", fontSize:10, cursor:"pointer", letterSpacing:2, whiteSpace:"nowrap", flexShrink:0 },
  adminTabActive: { borderBottomColor:"#00e5ff", color:"#00e5ff" },
  cmdBtn: { flex:1, padding:"8px", background:"transparent", border:"1px solid #1a3a5a", borderRadius:6, color:"#00e5ff", fontFamily:"monospace", fontSize:10, cursor:"pointer", letterSpacing:1 },
};

const globalCSS = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #060e1a; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: #060e1a; }
  ::-webkit-scrollbar-thumb { background: #1a2a40; border-radius: 2px; }
  .card-hover { transition: transform 0.15s, box-shadow 0.15s; }
  .card-hover:hover { transform: translateY(-2px); box-shadow: 0 4px 20px rgba(0,229,255,0.1); }
  @keyframes pulse { 0%,100%{box-shadow:0 0 0 3px rgba(0,229,255,0.2)} 50%{box-shadow:0 0 0 6px rgba(0,229,255,0.05)} }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
  @keyframes slideDown { from{opacity:0;transform:translateX(-50%) translateY(-10px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
  input::placeholder { color: #444; }
  input:focus { border-color: #1a3a5a !important; }
`;
