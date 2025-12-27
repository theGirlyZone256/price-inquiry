const Airtable = require('airtable');

// 1. Initialize Airtable with YOUR credentials
const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY // Your Personal Access Token will go here
}).base(process.env.AIRTABLE_BASE_ID); // Your Base ID will go here

// 2. Handle creating a product (POST /api/products)
module.exports = async (req, res) => {
  // Set headers to allow your frontend to talk to this backend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle browser preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // --- ROUTE 1: CREATE A NEW PRODUCT (POST /api/products) ---
  if (req.method === 'POST') {
    try {
      const { imageUrl } = req.body;
      if (!imageUrl) {
        return res.status(400).json({ success: false, error: 'Image URL is required' });
      }
      // Generate a unique ID: prod_ + random 6-digit number
      const productId = 'prod_' + Math.floor(100000 + Math.random() * 900000);
      
      // Save to Airtable 'products' table
      await base('products').create([{ fields: { id: productId, imageUrl } }]);
      
      return res.json({ 
        success: true, 
        productId: productId,
        message: 'Product inquiry created.'
      });
    } catch (error) {
      console.error('Error creating product:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // --- ROUTE 2: GET A PRODUCT BY ID (GET /api/products/[id]) ---
  if (req.method === 'GET' && req.query.id) {
    try {
      const productId = req.query.id;
      const records = await base('products').select({ filterByFormula: `{id} = '${productId}'` }).firstPage();
      
      if (records.length === 0) {
        return res.status(404).json({ success: false, error: 'Product not found' });
      }
      const product = records[0].fields;
      return res.json({ success: true, ...product });
    } catch (error) {
      console.error('Error fetching product:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // --- ROUTE 3: SUBMIT AN INQUIRY (POST /api/inquiries) ---
  if (req.method === 'POST' && req.url === '/api/inquiries') {
    try {
      const { productId, price, colors, notes } = req.body;
      if (!productId || !price) {
        return res.status(400).json({ success: false, error: 'Product ID and Price are required' });
      }
      // Save to Airtable 'inquiries' table
      await base('inquiries').create([{ fields: { productId, price: Number(price), colors, notes } }]);
      
      return res.json({ success: true, message: 'Inquiry response submitted.' });
    } catch (error) {
      console.error('Error submitting inquiry:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // If no route matches
  return res.status(404).json({ success: false, error: 'Route not found' });
};