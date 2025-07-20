-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Redacao" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "imagemUrl" TEXT NOT NULL,
    "textoExtraido" TEXT,
    "notaGerada" DOUBLE PRECISION,
    "notaFinal" DOUBLE PRECISION,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT NOT NULL,

    CONSTRAINT "Redacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Avaliacao" (
    "id" TEXT NOT NULL,
    "competencia" INTEGER NOT NULL,
    "notaComp" DOUBLE PRECISION NOT NULL,
    "comentario" TEXT,
    "redacaoId" TEXT NOT NULL,

    CONSTRAINT "Avaliacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "Redacao" ADD CONSTRAINT "Redacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avaliacao" ADD CONSTRAINT "Avaliacao_redacaoId_fkey" FOREIGN KEY ("redacaoId") REFERENCES "Redacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
