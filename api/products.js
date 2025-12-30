const Airtable = require('airtable');

const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID);

module.exports = async (req, res) => {
  // ================= IMPROVED CORS HANDLING =================
  const allowedOrigins = [
    'https://priceinquiry.netlify.app',
    'http://localhost:3000',
    'http://localhost:8000'
  ];
  
  const origin = req.headers.origin;
  const isAllowedOrigin = allowedOrigins.includes(origin) || origin?.includes('netlify.app');
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', isAllowedOrigin ? origin : '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  
  // Handle preflight OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  // ========================================================

  console.log(`🌐 ${req.method} ${req.url}`);
  
  // CREATE PROJECT
  if (req.method === 'POST' && req.url === '/api/products') {
    try {
      const { imageUrls, projectName } = req.body;
      
      if (!imageUrls || !Array.isArray(imageUrls)) {
        return res.status(400).json({ success: false, error: 'Image URLs array required' });
      }

      const projectId = 'proj_' + Math.floor(100000 + Math.random() * 900000);
      const projectRecord = await base('projects').create([{
        fields: {
          id: projectId,
          name: projectName || `Project ${new Date().toLocaleDateString()}`,
          Status: 'Todo',
          createdAt: new Date().toISOString()
        }
      }]);

      // Create product records
      const productRecords = imageUrls.map((url, i) => ({
        fields: {
          id: `${projectId}_item${i + 1}`,
          imageUrl: url,
          project: [projectRecord[0].id]
        }
      }));
      
      // Batch create products (max 10 per request for Airtable)
      for (let i = 0; i < productRecords.length; i += 10) {
        const batch = productRecords.slice(i, i + 10);
        await base('products').create(batch);
      }
      
      return res.json({ 
        success: true, 
        projectId: projectId,
        productCount: imageUrls.length,
        inquiryUrl: `https://priceinquiry.netlify.app/?project=${projectId}`,
        message: `Project created with ${imageUrls.length} product(s).`
      });
    } catch (error) {
      console.error('Error creating project:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // GET PROJECT WITH PRODUCTS
  if (req.method === 'GET' && req.query.project) {
    try {
      const projectId = req.query.project;
      
      const projectRecords = await base('projects').select({
        filterByFormula: `{id} = '${projectId}'`
      }).firstPage();
      
      if (projectRecords.length === 0) {
        return res.status(404).json({ success: false, error: 'Project not found' });
      }
      
      const project = projectRecords[0].fields;
      const projectAirtableId = projectRecords[0].id;
      
      // Get all products linked to this project
      const productRecords = await base('products').select({
        filterByFormula: `{project} = '${projectAirtableId}'`
      }).firstPage();
      
      const linkedProducts = productRecords.map(record => ({
        id: record.fields.id,
        imageUrl: record.fields.imageUrl
      }));
      
      console.log(`✅ Found ${linkedProducts.length} products for project ${projectId}`);
      
      return res.json({
        success: true,
        project: {
          id: project.id,
          name: project.name,
          status: project.Status || 'Todo',
          createdAt: project.createdAt
        },
        products: linkedProducts
      });
      
    } catch (error) {
      console.error('Error fetching project:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // SUBMIT INQUIRY
  if (req.method === 'POST' && req.url === '/api/inquiries') {
    try {
      console.log('📝 Inquiry body:', req.body);
      const { productId, price, colors, notes } = req.body;
      
      if (!productId || !price) {
        return res.status(400).json({ success: false, error: 'Product ID and Price are required' });
      }
      
      // First, find the product to get its image URL
      const productRecords = await base('products').select({
        filterByFormula: `{id} = '${productId}'`
      }).firstPage();
      
      if (productRecords.length === 0) {
        return res.status(404).json({ success: false, error: 'Product not found' });
      }
      
      const product = productRecords[0];
      const projectId = product.fields.project?.[0];
      
      // Create the inquiry record
      const inquiryRecord = await base('inquiries').create([{ 
        fields: { 
          productId, 
          price: Number(price), 
          colors: colors || '', 
          notes: notes || '',
          productImage: product.fields.imageUrl,
          project: projectId ? [projectId] : [],
          submittedAt: new Date().toISOString(),
          status: 'Submitted'
        } 
      }]);
      
      console.log(`✅ Inquiry saved: ${inquiryRecord[0].id} for product: ${productId}`);
      
      return res.json({ 
        success: true, 
        message: 'Inquiry response submitted.',
        inquiryId: inquiryRecord[0].id 
      });
    } catch (error) {
      console.error('Error submitting inquiry:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // Default 404 for unmatched routes
  return res.status(404).json({ 
    success: false, 
    error: 'Route not found',
    requestedUrl: req.url,
    method: req.method 
  });
};