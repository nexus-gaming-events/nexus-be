import { FastifyInstance } from 'fastify';

export async function legalRoutes(app: FastifyInstance) {
    app.get('/privacy', {
        schema: {
            tags: ['Legal'],
            description: 'Privacy Policy HTML Page',
            hide: true // Optional: Set to false if you want it in Swagger
        }
    }, async (req, reply) => {
        const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Privacy Policy - Nexus</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; line-height: 1.6; color: #333; }
          h1 { border-bottom: 2px solid #eee; padding-bottom: 10px; }
          h2 { margin-top: 30px; color: #444; }
          .date { color: #666; font-style: italic; margin-bottom: 40px; }
        </style>
      </head>
      <body>
        <h1>Privacy Policy</h1>
        <p class="date">Last updated: ${new Date().toLocaleDateString()}</p>
        
        <h2>1. Introduction</h2>
        <p>Welcome to Nexus ("we," "our," or "us"). We respect your privacy and are committed to protecting your personal data. This privacy policy will inform you as to how we look after your personal data when you visit our application and tell you about your privacy rights.</p>
        
        <h2>2. Data We Collect</h2>
        <p>We may collect, use, store and transfer different kinds of personal data about you which we have grouped together follows:</p>
        <ul>
            <li><strong>Identity Data:</strong> includes username, or similar identifier, and social media provider IDs (Google, Discord, Steam).</li>
            <li><strong>Contact Data:</strong> includes email address.</li>
            <li><strong>Technical Data:</strong> includes internet protocol (IP) address, your login data, browser type and version.</li>
        </ul>

        <h2>3. How We Use Your Data</h2>
        <p>We will only use your personal data when the law allows us to. Most commonly, we will use your personal data in the following circumstances:</p>
        <ul>
            <li>To register you as a new customer/user.</li>
            <li>To manage our relationship with you.</li>
            <li>To administer and protect our business and this website.</li>
        </ul>

        <h2>4. Contact Us</h2>
        <p>If you have any questions about this privacy policy or our privacy practices, please contact us at: support@nexus-app.local</p>
      </body>
      </html>
    `;
        return reply.type('text/html').send(html);
    });

    app.get('/terms', {
        schema: {
            tags: ['Legal'],
            description: 'Terms of Service HTML Page',
            hide: true
        }
    }, async (req, reply) => {
        const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Terms of Service - Nexus</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; line-height: 1.6; color: #333; }
          h1 { border-bottom: 2px solid #eee; padding-bottom: 10px; }
          h2 { margin-top: 30px; color: #444; }
          .date { color: #666; font-style: italic; margin-bottom: 40px; }
        </style>
      </head>
      <body>
        <h1>Terms of Service</h1>
        <p class="date">Last updated: ${new Date().toLocaleDateString()}</p>
        
        <h2>1. Agreement to Terms</h2>
        <p>By accessing or using our services, you agree to be bound by these Terms. If you disagree with any part of the terms then you may not access the Service.</p>
        
        <h2>2. Intellectual Property</h2>
        <p>The Service and its original content, features and functionality are and will remain the exclusive property of Nexus and its licensors.</p>
        
        <h2>3. User Accounts</h2>
        <p>When you create an account with us, you must provide us information that is accurate, complete, and current at all times. Failure to do so constitutes a breach of the Terms, which may result in immediate termination of your account on our Service.</p>
        
        <h2>4. Termination</h2>
        <p>We may terminate or suspend access to our Service immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.</p>
        
        <h2>5. Governing Law</h2>
        <p>These Terms shall be governed and construed in accordance with the laws of [Your Country/State], without regard to its conflict of law provisions.</p>
      </body>
      </html>
    `;
        return reply.type('text/html').send(html);
    });
}
