const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  try {
    const id = '00000000-0000-0000-0000-000000000001';
    const user = await prisma.user.upsert({
      where: { id },
      update: { nome: 'Teste' },
      create: {
        id,
        nome: 'Teste',
        email: 'teste@example.com',
        senhaHash: 'hashfake'
      }
    });
    console.log('OK', user.id);
  } catch (e) {
    console.error('ERRO:', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
